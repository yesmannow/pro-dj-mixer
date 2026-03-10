export class AudioEngine {
  private static instance: AudioEngine;
  public context: AudioContext;
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
    crushNode: WaveShaperNode;
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
    const crushNode = this.context.createWaveShaper();
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
      const curve = this.makeDistortionCurve(norm);
      fx.crushNode.curve = curve;
      fx.crushNode.oversample = '4x';
      const preGain = 1 - norm * 0.35;
      const postGain = 1 + norm * 0.6;
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
