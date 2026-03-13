export class AudioEngine {
  private static instance: AudioEngine;
  public context: AudioContext;
  public masterGain: GainNode;
  public masterAnalyser: AnalyserNode;
  private bunkerConvolver: ConvolverNode;
  private bunkerWetGain: GainNode;
  private bunkerDryGain: GainNode;
  private bunkerPreDelay: DelayNode;
  private bunkerImpulseLoaded = false;
  private masterDataArray: Uint8Array<ArrayBuffer>;
  private deckAnalysers: Partial<Record<'A' | 'B', AnalyserNode>> = {};
  private deckDataArrays: Partial<Record<'A' | 'B', Uint8Array<ArrayBuffer>>> = {};
  private decks: Record<'A' | 'B', {
    buffer: AudioBuffer | null;
    source: AudioBufferSourceNode | null;
    stemInput: GainNode | null;
    deckGain: GainNode | null;
    isPlaying: boolean;
    playbackRate: number;
    pauseTime: number;
    onSourceSwap?: (source: AudioBufferSourceNode | null) => void;
    onPauseTime?: (time: number) => void;
  }> = {
    A: {
      buffer: null,
      source: null,
      stemInput: null,
      deckGain: null,
      isPlaying: false,
      playbackRate: 1,
      pauseTime: 0,
    },
    B: {
      buffer: null,
      source: null,
      stemInput: null,
      deckGain: null,
      isPlaying: false,
      playbackRate: 1,
      pauseTime: 0,
    },
  };
  private originalPlayState: Record<'A' | 'B', boolean> = { A: false, B: false };
  private deckFxBuses: Partial<Record<'A' | 'B', {
    input: GainNode;
    crushPreGain: GainNode;
    crushNode: ScriptProcessorNode;
    crushState: { step: number; holdSample: number; decimation: number; reduction: number };
    crushPostGain: GainNode;
    filter: BiquadFilterNode;
    delayNode: DelayNode;
    delayFeedbackGain: GainNode;
    delayMixGain: GainNode;
    dryGain: GainNode;
    deckGain: GainNode;
    output: GainNode;
  }>> = {};
  private stemGains: Partial<Record<'A' | 'B', {
    drums: GainNode;
    inst: GainNode;
    vocals: GainNode;
  }>> = {};

  private constructor() {
    this.context = new (globalThis.window.AudioContext || (globalThis.window as any).webkitAudioContext)();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.95;

    this.masterAnalyser = this.context.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.82;
    this.masterDataArray = new Uint8Array(new ArrayBuffer(this.masterAnalyser.frequencyBinCount));

    this.bunkerConvolver = this.context.createConvolver();
    this.bunkerPreDelay = this.context.createDelay(1.0);
    this.bunkerPreDelay.delayTime.value = 0.02; // 20ms
    this.bunkerWetGain = this.context.createGain();
    this.bunkerDryGain = this.context.createGain();
    this.bunkerWetGain.gain.value = 0.2;
    this.bunkerDryGain.gain.value = 0.9;

    // Master routing: masterGain -> analyser -> (dry + bunker) -> destination
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.bunkerDryGain);
    this.masterAnalyser.connect(this.bunkerPreDelay);
    this.bunkerPreDelay.connect(this.bunkerConvolver);
    this.bunkerConvolver.connect(this.bunkerWetGain);

    this.bunkerDryGain.connect(this.context.destination);
    this.bunkerWetGain.connect(this.context.destination);

    void this.loadBunkerImpulse();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  public async loadBuffer(file: File | Blob | string): Promise<AudioBuffer> {
    let arrayBuffer: ArrayBuffer;
    if (typeof file === 'string') {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`Failed to fetch from cloud: ${response.status} - ${file}`);
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Cloudflare returned an HTML error page. Check exact filename and path.');
      }
      arrayBuffer = await response.arrayBuffer();
    } else {
      arrayBuffer = await file.arrayBuffer();
    }
    return await this.context.decodeAudioData(arrayBuffer);
  }

  public createPitchLockedSource(buffer: AudioBuffer) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  public registerDeckRuntime(
    deckId: 'A' | 'B',
    payload: Partial<{
      buffer: AudioBuffer | null;
      source: AudioBufferSourceNode | null;
      stemInput: GainNode | null;
      deckGain: GainNode | null;
      isPlaying: boolean;
      playbackRate: number;
      pauseTime: number;
      onSourceSwap?: (source: AudioBufferSourceNode | null) => void;
      onPauseTime?: (time: number) => void;
    }>
  ) {
    this.decks[deckId] = {
      ...this.decks[deckId],
      ...payload,
    };
  }

  public startStutter(deckId: 'A' | 'B', time: number) {
    const deck = this.decks[deckId];
    if (!deck?.buffer || !deck.stemInput || !deck.deckGain) return null;

    const now = this.context.currentTime;
    const targetTime = Math.max(0, Math.min(time, deck.buffer.duration));
    this.originalPlayState[deckId] = deck.isPlaying;

    // Anti-click fade out of the current source
    deck.deckGain.gain.cancelScheduledValues(now);
    deck.deckGain.gain.setValueAtTime(deck.deckGain.gain.value, now);
    deck.deckGain.gain.linearRampToValueAtTime(0, now + 0.002);

    if (deck.source) {
      try {
        deck.source.stop(now + 0.002);
      } catch {
        // Source might already be stopped
      }
      deck.source.disconnect();
    }

    // Recreate a fresh source and start from the requested position
    const freshSource = this.createPitchLockedSource(deck.buffer);
    freshSource.playbackRate.value = deck.playbackRate;
    freshSource.connect(deck.stemInput);
    freshSource.start(now + 0.002, targetTime);

    deck.deckGain.gain.setValueAtTime(0, now + 0.002);
    deck.deckGain.gain.linearRampToValueAtTime(1, now + 0.004);

    deck.source = freshSource;
    deck.isPlaying = true;
    deck.pauseTime = targetTime;
    deck.onSourceSwap?.(freshSource);
    deck.onPauseTime?.(targetTime);

    return freshSource;
  }

  public stopStutter(deckId: 'A' | 'B', time: number) {
    const deck = this.decks[deckId];
    if (!deck?.deckGain) return;
    const now = this.context.currentTime;
    const targetTime = deck.buffer ? Math.max(0, Math.min(time, deck.buffer.duration)) : time;

    if (!this.originalPlayState[deckId]) {
      deck.deckGain.gain.cancelScheduledValues(now);
      deck.deckGain.gain.setValueAtTime(deck.deckGain.gain.value, now);
      deck.deckGain.gain.linearRampToValueAtTime(0, now + 0.002);

      if (deck.source) {
        try {
          deck.source.stop(now + 0.002);
        } catch {
          // ignore
        }
        deck.source.disconnect();
        deck.source = null;
        deck.onSourceSwap?.(null);
      }

      deck.isPlaying = false;
      deck.pauseTime = targetTime;
      deck.onPauseTime?.(targetTime);
    }

    // Reset the remembered state for the next gesture
    this.originalPlayState[deckId] = false;
  }

  public createStemChain(deckId: 'A' | 'B') {
    const input = this.context.createGain();
    const output = this.context.createGain();

    const drumsFilter = this.context.createBiquadFilter();
    drumsFilter.type = 'lowpass';
    drumsFilter.frequency.value = 250;

    const instFilter = this.context.createBiquadFilter();
    instFilter.type = 'bandpass';
    instFilter.frequency.value = 1000;
    instFilter.Q.value = 0.5;

    const vocalsFilter = this.context.createBiquadFilter();
    vocalsFilter.type = 'highpass';
    vocalsFilter.frequency.value = 2000;

    const drumsGain = this.context.createGain();
    const instGain = this.context.createGain();
    const vocalsGain = this.context.createGain();

    drumsGain.gain.value = 1;
    instGain.gain.value = 1;
    vocalsGain.gain.value = 1;

    input.connect(drumsFilter);
    input.connect(instFilter);
    input.connect(vocalsFilter);

    drumsFilter.connect(drumsGain);
    instFilter.connect(instGain);
    vocalsFilter.connect(vocalsGain);

    drumsGain.connect(output);
    instGain.connect(output);
    vocalsGain.connect(output);

    this.stemGains[deckId] = {
      drums: drumsGain,
      inst: instGain,
      vocals: vocalsGain
    };

    return {
      input,
      output,
      drumsFilter,
      instFilter,
      vocalsFilter
    };
  }

  public createDeckFxBus(deckId: 'A' | 'B') {
    if (this.deckFxBuses[deckId]) {
      return this.deckFxBuses[deckId];
    }

    const input = this.context.createGain();
    const crushPreGain = this.context.createGain();
    const crushNode = this.context.createScriptProcessor(256, 1, 1);
    const crushState = { step: 0, holdSample: 0, decimation: 4, reduction: 4 };
    crushNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);
      const decimation = Math.max(1, Math.round(crushState.decimation));
      const reduction = Math.max(1, crushState.reduction);
      for (let i = 0; i < input.length; i++) {
        if (crushState.step % decimation === 0) {
          const sample = input[i];
          const aliased = Math.floor(sample * reduction) / reduction;
          crushState.holdSample = aliased;
        }
        output[i] = crushState.holdSample;
        crushState.step++;
      }
    };
    const crushPostGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const delayNode = this.context.createDelay(2);
    const delayFeedbackGain = this.context.createGain();
    const delayMixGain = this.context.createGain();
    const dryGain = this.context.createGain();
    const deckGain = this.context.createGain();
    const output = this.context.createGain();

    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    filter.Q.value = 0.9;

    delayNode.delayTime.value = 0.18;
    delayFeedbackGain.gain.value = 0.22;
    delayMixGain.gain.value = 0;
    dryGain.gain.value = 1;
    deckGain.gain.value = 0.9;

    input.connect(crushPreGain);
    crushPreGain.connect(crushNode);
    crushNode.connect(crushPostGain);
    crushPostGain.connect(filter);

    filter.connect(dryGain);
    filter.connect(delayNode);

    delayNode.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delayNode);
    delayNode.connect(delayMixGain);

    dryGain.connect(deckGain);
    delayMixGain.connect(deckGain);
    deckGain.connect(output);

    const bus = {
      input,
      crushPreGain,
      crushNode,
      crushState,
      crushPostGain,
      filter,
      delayNode,
      delayFeedbackGain,
      delayMixGain,
      dryGain,
      deckGain,
      output,
    };
    this.deckFxBuses[deckId] = bus;
    this.setDeckFX(deckId, 'filter', 50);
    this.setDeckFX(deckId, 'echo', 0);
    this.setDeckFX(deckId, 'crush', 0);
    return bus;
  }

  public setDeckFX(deckId: 'A' | 'B', type: 'filter' | 'echo' | 'crush', value: number) {
    const fx = this.deckFxBuses[deckId];
    if (!fx) return;
    const now = this.context.currentTime;
    const norm = Math.max(0, Math.min(1, value / 100));

    if (type === 'filter') {
      const min = 180;
      const max = 18000;
      const freq = min * Math.pow(max / min, norm);
      const resonance = 0.7 + norm * 1.2;
      fx.filter.frequency.setTargetAtTime(freq, now, 0.03);
      fx.filter.Q.setTargetAtTime(resonance, now, 0.03);
      return;
    }

    if (type === 'echo') {
      const delayTime = 0.08 + norm * 0.42; // 80ms -> 500ms
      const feedback = Math.min(0.88, 0.12 + norm * 0.65);
      const mix = Math.min(0.85, norm * 0.85);
      const dry = 1 - mix * 0.65;
      fx.delayNode.delayTime.setTargetAtTime(delayTime, now, 0.03);
      fx.delayFeedbackGain.gain.setTargetAtTime(feedback, now, 0.03);
      fx.delayMixGain.gain.setTargetAtTime(mix, now, 0.03);
      fx.dryGain.gain.setTargetAtTime(dry, now, 0.03);
      return;
    }

    if (type === 'crush') {
      const decimation = 1 + norm * 12; // 1..13
      const reduction = 4 + norm * 60; // quantization levels
      const preGain = 1 - norm * 0.2;
      const postGain = 1 + norm * 0.9;
      fx.crushState.decimation = decimation;
      fx.crushState.reduction = reduction;
      fx.crushPreGain.gain.setTargetAtTime(preGain, now, 0.03);
      fx.crushPostGain.gain.setTargetAtTime(postGain, now, 0.03);
    }
  }

  private makeDistortionCurve(amount: number) {
    const samples = 65536;
    const curve = new Float32Array(samples);
    const normalized = Math.max(0, Math.min(1, amount));
    const minBits = 4;
    const maxBits = 16;
    const bits = Math.round(maxBits - normalized * (maxBits - minBits));
    const levels = Math.pow(2, bits - 1);

    for (let i = 0; i < samples; ++i) {
      const x = (i / samples) * 2 - 1;
      const quantized = Math.round(x * levels) / levels;
      curve[i] = quantized;
    }
    return curve;
  }

  private async loadBunkerImpulse() {
    if (this.bunkerImpulseLoaded) return;
    try {
      const res = await fetch('/impulses/concrete-bunker.wav');
      if (!res.ok) throw new Error('Failed IR fetch');
      const array = await res.arrayBuffer();
      this.bunkerConvolver.buffer = await this.context.decodeAudioData(array.slice(0));
      this.bunkerImpulseLoaded = true;
    } catch {
      // Fallback synthetic IR: exponential decay noise burst
      const length = this.context.sampleRate * 2.5;
      const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
      for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const decay = Math.exp(-i / (this.context.sampleRate * 1.2));
          data[i] = (Math.random() * 2 - 1) * decay;
        }
      }
      this.bunkerConvolver.buffer = impulse;
      this.bunkerImpulseLoaded = true;
    }
  }

  public setVaultAmbience(amount: number) {
    const wet = Math.max(0, Math.min(1, amount));
    const dry = 1 - wet * 0.5;
    const now = this.context.currentTime;
    this.bunkerWetGain.gain.setTargetAtTime(wet, now, 0.05);
    this.bunkerDryGain.gain.setTargetAtTime(dry, now, 0.05);
  }

  public getMasterEnergy(): { rms: number; low: number } {
    this.masterAnalyser.getByteFrequencyData(this.masterDataArray);
    let sum = 0;
    let lowSum = 0;
    const len = this.masterDataArray.length;
    for (let i = 0; i < len; i++) {
      const v = this.masterDataArray[i] / 255;
      sum += v * v;
      if (i < len * 0.1) lowSum += v;
    }
    return {
      rms: Math.sqrt(sum / len),
      low: lowSum / (len * 0.1),
    };
  }

  public registerDeckAnalyser(deckId: 'A' | 'B', analyser: AnalyserNode) {
    this.deckAnalysers[deckId] = analyser;
    this.deckDataArrays[deckId] = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  }

  public getDeckEnergy(deckId: 'A' | 'B'): { rms: number; peak: number } {
    const analyser = this.deckAnalysers[deckId];
    const arr = this.deckDataArrays[deckId];
    if (!analyser || !arr) return { rms: 0, peak: 0 };
    analyser.getByteTimeDomainData(arr);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < arr.length; i++) {
      const sample = (arr[i] - 128) / 128; // -1..1
      const abs = Math.abs(sample);
      sum += sample * sample;
      if (abs > peak) peak = abs;
    }
    return { rms: Math.sqrt(sum / arr.length), peak };
  }

  public setStemMute(deckId: 'A' | 'B', stemType: 'drums' | 'inst' | 'vocals', isMuted: boolean) {
    const deckStemGains = this.stemGains[deckId];
    if (!deckStemGains) return;
    const target = isMuted ? 0 : 1;
    deckStemGains[stemType].gain.setTargetAtTime(target, this.context.currentTime, 0.01);
  }

  public createEQChain() {
    const low = this.context.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 250;

    const mid = this.context.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 1;

    const high = this.context.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 4000;

    // Connect chain: input -> low -> mid -> high -> output
    low.connect(mid);
    mid.connect(high);

    return {
      input: low,
      output: high,
      low,
      mid,
      high
    };
  }

  public getCrossfaderGains(
    crossfaderValue: number,
    curve: 'blend' | 'cut' = 'blend'
  ): { gainA: number; gainB: number } {
    // crossfaderValue ranges from -1 (Deck A) to 1 (Deck B)
    const x = (crossfaderValue + 1) / 2; // 0 -> 1

    if (curve === 'cut') {
      if (x <= 0.05) {
        return { gainA: 1, gainB: 0 };
      }
      if (x >= 0.95) {
        return { gainA: 0, gainB: 1 };
      }
      return { gainA: 1, gainB: 1 };
    }

    // Equal power blend curve
    const gainA = Math.cos(x * 0.5 * Math.PI);
    const gainB = Math.cos((1 - x) * 0.5 * Math.PI);
    return { gainA, gainB };
  }
}
