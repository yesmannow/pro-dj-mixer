export type StemType = 'drums' | 'inst' | 'vocals';
export type NeuralStemGains = Record<StemType, { a: number; b: number }>;
const NEURAL_STEM_GAIN = 0.33;
const NEURAL_DRUMS_THRESHOLD = 0.25;
const NEURAL_INST_THRESHOLD = 0.5;
const NEURAL_VOCALS_THRESHOLD = 0.75;

export const calculateNeuralGains = (xfade: number): NeuralStemGains => {
  const norm = Math.max(0, Math.min(1, (xfade + 1) / 2));

  // Drums and instruments intentionally hard-swap at their power points; timing smoothness is applied
  // in the deck hook with sub-10ms/short ramps so the stems trade places without kick or tonal clashes.
  return {
    drums: norm > NEURAL_DRUMS_THRESHOLD ? { a: 0, b: NEURAL_STEM_GAIN } : { a: NEURAL_STEM_GAIN, b: 0 },
    inst: norm > NEURAL_INST_THRESHOLD ? { a: 0, b: NEURAL_STEM_GAIN } : { a: NEURAL_STEM_GAIN, b: 0 },
    vocals: norm > NEURAL_VOCALS_THRESHOLD ? { a: 0, b: NEURAL_STEM_GAIN } : { a: NEURAL_STEM_GAIN, b: 0 },
  };
};

export class AudioEngine {
  private static instance: AudioEngine;
  public context: AudioContext;
  public masterGain: GainNode;
  public masterAnalyser: AnalyserNode;
  public cueGain: GainNode;
  private cueMonitorGain: GainNode;
  private masterMonitorGain: GainNode;
  private masterPanner: StereoPannerNode;
  private cuePanner: StereoPannerNode;
  private isSplitMono = true;
  private remixBus: GainNode;
  private limiter: DynamicsCompressorNode;
  private bunkerConvolver: ConvolverNode;
  private bunkerWetGain: GainNode;
  private bunkerDryGain: GainNode;
  private bunkerPreDelay: DelayNode;
  private bunkerImpulseLoaded = false;
  private bunkerImpulseWarningLogged = false;
  private masterDataArray: Uint8Array<ArrayBuffer>;
  private workletReadyPromise: Promise<boolean> | null = null;
  private workletWarningLogged = false;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private readonly latencyHint: AudioContextLatencyCategory = 'interactive';
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
    currentTime: number;
    keyLockEnabled: boolean;
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
      currentTime: 0,
      keyLockEnabled: false,
    },
    B: {
      buffer: null,
      source: null,
      stemInput: null,
      deckGain: null,
      isPlaying: false,
      playbackRate: 1,
      pauseTime: 0,
      currentTime: 0,
      keyLockEnabled: false,
    },
  };
  private originalPlayState: Record<'A' | 'B', boolean> = { A: false, B: false };
  private deckFxBuses: Partial<Record<'A' | 'B', {
    input: GainNode;
    crushBypassGain: GainNode;
    crushPreGain: GainNode;
    crushNode: AudioWorkletNode | GainNode;
    crushSupported: boolean;
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
  private stemDirectGains: Partial<Record<'A' | 'B', {
    drums: GainNode;
    inst: GainNode;
    vocals: GainNode;
  }>> = {};
  private stemFxGains: Partial<Record<'A' | 'B', {
    drums: GainNode;
    inst: GainNode;
    vocals: GainNode;
  }>> = {};
  private stemChains: Partial<Record<'A' | 'B', {
    input: GainNode;
    output: GainNode;
    fxOutput: GainNode;
  }>> = {};
  private deckCueGains: Partial<Record<'A' | 'B', GainNode>> = {};
  private performanceLoops: Record<'A' | 'B', {
    mode: 'slip-roll' | 'beat-break' | null;
    originTime: number;
    loopStart: number;
    loopDuration: number;
    startedAtContextTime: number;
    wasPlaying: boolean;
  }> = {
    A: { mode: null, originTime: 0, loopStart: 0, loopDuration: 0, startedAtContextTime: 0, wasPlaying: false },
    B: { mode: null, originTime: 0, loopStart: 0, loopDuration: 0, startedAtContextTime: 0, wasPlaying: false },
  };
  private static readonly STEM_COUNT = 3;
  private static readonly STEM_UNITY_CONTRIBUTION = 0.33;
  private static readonly DEFAULT_PLAYBACK_RAMP = 0.01;
  private static readonly KEY_LOCK_PLAYBACK_RAMP = 0.02;
  private static readonly CRUSH_ACTIVATION_THRESHOLD = 0.001;
  private static readonly MIN_PERFORMANCE_LOOP_DURATION = 0.05;
  private static readonly TARGET_RECORDING_SAMPLE_RATE = 48000;
  private static readonly TARGET_RECORDING_BIT_DEPTH = 24;

  private constructor() {
    if (typeof window === 'undefined') {
      throw new Error('AudioEngine can only be constructed in the browser.');
    }

    const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AudioContextCtor) {
      throw new Error('Web Audio API is unavailable in this browser.');
    }

    try {
      this.context = new AudioContextCtor({
        latencyHint: this.latencyHint,
        sampleRate: AudioEngine.TARGET_RECORDING_SAMPLE_RATE,
      });
    } catch {
      this.context = new AudioContextCtor();
    }
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.7;
    this.cueGain = this.context.createGain();
    this.cueGain.gain.value = 1;
    this.cueMonitorGain = this.context.createGain();
    this.cueMonitorGain.gain.value = 1;
    this.masterMonitorGain = this.context.createGain();
    this.masterMonitorGain.gain.value = 1;
    this.masterPanner = this.context.createStereoPanner();
    this.cuePanner = this.context.createStereoPanner();
    this.remixBus = this.context.createGain();
    this.remixBus.gain.value = 0.72;

    this.masterAnalyser = this.context.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.85;
    this.masterDataArray = new Uint8Array(new ArrayBuffer(this.masterAnalyser.frequencyBinCount));
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-1, this.context.currentTime);
    this.limiter.knee.setValueAtTime(0, this.context.currentTime);
    this.limiter.ratio.setValueAtTime(20, this.context.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.context.currentTime);
    this.limiter.release.setValueAtTime(0.1, this.context.currentTime);

    this.bunkerConvolver = this.context.createConvolver();
    this.bunkerPreDelay = this.context.createDelay(1.0);
    this.bunkerPreDelay.delayTime.value = 0.02; // 20ms
    this.bunkerWetGain = this.context.createGain();
    this.bunkerDryGain = this.context.createGain();
    this.bunkerWetGain.gain.value = 0.2;
    this.bunkerDryGain.gain.value = 0.8;

    // Master routing: masterGain -> analyser -> (dry + bunker) -> limiter -> destination
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.bunkerDryGain);
    this.masterAnalyser.connect(this.bunkerPreDelay);
    this.bunkerPreDelay.connect(this.bunkerConvolver);
    this.bunkerConvolver.connect(this.bunkerWetGain);

    this.bunkerDryGain.connect(this.limiter);
    this.bunkerWetGain.connect(this.limiter);
    // Remix bus is intentionally post-master-FX but pre-limiter so captured loops bypass deck/master FX
    // coloration while still landing inside the final safety stage.
    this.remixBus.connect(this.limiter);
    this.limiter.connect(this.context.destination);
    this.masterGain.connect(this.masterMonitorGain);
    this.masterMonitorGain.connect(this.masterPanner);
    this.masterPanner.connect(this.context.destination);
    this.cueGain.connect(this.cueMonitorGain);
    this.cueMonitorGain.connect(this.cuePanner);
    this.cuePanner.connect(this.context.destination);

    // Recording tap: connect the final post-limiter signal to the MediaStreamDestination
    this.recordingDestination = this.context.createMediaStreamDestination();
    this.limiter.connect(this.recordingDestination);

    this.workletReadyPromise = this.ensureAudioWorklets();
    void this.loadBunkerImpulse();
    this.setSplitMonoEnabled(true);
  }

  public static getInstance(): AudioEngine {
    if (typeof window === 'undefined') {
      throw new Error('AudioEngine is unavailable during server-side rendering.');
    }
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

  public createPitchLockedSource(deckId: 'A' | 'B', buffer: AudioBuffer) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    this.applyPitchLock(source, deckId);
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
        currentTime: number;
        keyLockEnabled: boolean;
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
    const freshSource = this.createPitchLockedSource(deckId, deck.buffer);
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
    // Reuse existing nodes to prevent duplicate audio nodes in the graph
    const existingGains = this.stemGains[deckId];
    const existingChain = this.stemChains[deckId];
    if (existingGains && existingChain) {
      return existingChain;
    }

    const input = this.context.createGain();
    const output = this.context.createGain();
    const fxOutput = this.context.createGain();
    const cueSend = this.deckCueGains[deckId] ?? this.context.createGain();

    const drumsGain = existingGains?.drums ?? this.context.createGain();
    const instGain = existingGains?.inst ?? this.context.createGain();
    const vocalsGain = existingGains?.vocals ?? this.context.createGain();
    const drumsDirectGain = this.context.createGain();
    const instDirectGain = this.context.createGain();
    const vocalsDirectGain = this.context.createGain();
    const drumsFxGain = this.context.createGain();
    const instFxGain = this.context.createGain();
    const vocalsFxGain = this.context.createGain();

    [drumsGain, instGain, vocalsGain].forEach((gainNode) => {
      gainNode.gain.value = AudioEngine.STEM_UNITY_CONTRIBUTION;
    });
    cueSend.gain.value = 0;
    // Before Phase 7 every stem branch fed the deck FX bus, so deck FX always processed the full deck.
    // Start in that same all-to-FX posture so existing mixes still sound identical until the user
    // deliberately drops specific stems back to the dry path via the new FX Sends controls.
    [drumsDirectGain, instDirectGain, vocalsDirectGain].forEach((gainNode) => {
      gainNode.gain.value = 0;
    });
    [drumsFxGain, instFxGain, vocalsFxGain].forEach((gainNode) => {
      gainNode.gain.value = 1;
    });

    // Balance the summed stem path so all three active stems land near unity
    // (STEM_COUNT × STEM_UNITY_CONTRIBUTION ≈ 1.0, so each active stem contributes one-third),
    // which keeps the deck input from clipping before EQ, FX, and the master bus.
    // Wire: input -> [drums | inst | vocals] GainNodes -> [direct + FX send] -> [output + fxOutput]
    input.connect(drumsGain);
    input.connect(instGain);
    input.connect(vocalsGain);
    input.connect(cueSend);

    drumsGain.connect(drumsDirectGain);
    drumsGain.connect(drumsFxGain);
    instGain.connect(instDirectGain);
    instGain.connect(instFxGain);
    vocalsGain.connect(vocalsDirectGain);
    vocalsGain.connect(vocalsFxGain);

    drumsDirectGain.connect(output);
    instDirectGain.connect(output);
    vocalsDirectGain.connect(output);
    drumsFxGain.connect(fxOutput);
    instFxGain.connect(fxOutput);
    vocalsFxGain.connect(fxOutput);
    cueSend.connect(this.cueGain);

    this.stemGains[deckId] = { drums: drumsGain, inst: instGain, vocals: vocalsGain };
    this.stemDirectGains[deckId] = { drums: drumsDirectGain, inst: instDirectGain, vocals: vocalsDirectGain };
    this.stemFxGains[deckId] = { drums: drumsFxGain, inst: instFxGain, vocals: vocalsFxGain };
    this.stemChains[deckId] = { input, output, fxOutput };
    this.deckCueGains[deckId] = cueSend;

    return this.stemChains[deckId]!;
  }

  private async ensureAudioWorklets(): Promise<boolean> {
    if (!this.context.audioWorklet) {
      if (!this.workletWarningLogged) {
        console.warn('[AudioEngine] AudioWorklet unavailable. Crush FX will run in bypass mode.');
        this.workletWarningLogged = true;
      }
      return false;
    }

    try {
      await this.context.audioWorklet.addModule('/worklets/bitcrusher-processor.js');
      return true;
    } catch (error) {
      if (!this.workletWarningLogged) {
        const message = error instanceof Error ? error.message : 'unknown worklet load failure';
        console.warn(`[AudioEngine] Failed to load bitcrusher worklet (${message}). Crush FX will run in bypass mode.`);
        this.workletWarningLogged = true;
      }
      return false;
    }
  }

  private async createCrushNode(initialDecimation: number, initialReduction: number) {
    const workletReady = this.workletReadyPromise ? await this.workletReadyPromise : await this.ensureAudioWorklets();
    if (!workletReady) {
      return {
        crushNode: this.context.createGain(),
        crushSupported: false,
        crushState: { step: 0, holdSample: 0, decimation: initialDecimation, reduction: initialReduction }
      };
    }

    const crushNode = new AudioWorkletNode(this.context, 'bitcrusher-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        decimation: initialDecimation,
        reduction: initialReduction,
      }
    });

    const crushState = { step: 0, holdSample: 0, decimation: initialDecimation, reduction: initialReduction };
    return { crushNode, crushSupported: true, crushState };
  }

  public async createDeckFxBus(deckId: 'A' | 'B') {
    if (this.deckFxBuses[deckId]) {
      return this.deckFxBuses[deckId];
    }

    const input = this.context.createGain();
    const crushBypassGain = this.context.createGain();
    const crushPreGain = this.context.createGain();
    const { crushNode, crushSupported, crushState } = await this.createCrushNode(4, 4);
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
    crushBypassGain.gain.value = 1;

    input.connect(crushBypassGain);
    input.connect(crushPreGain);
    crushBypassGain.connect(filter);
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
      crushBypassGain,
      crushPreGain,
      crushNode,
      crushSupported,
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
      // Treat near-zero UI values as "off" so the worklet can fully bypass and stop background fizz.
      const crushActive = norm > AudioEngine.CRUSH_ACTIVATION_THRESHOLD;
      const preGain = crushActive ? 1 - norm * 0.2 : 0;
      const postGain = crushActive ? 1 + norm * 0.9 : 0;
      const bypassGain = crushActive ? 0 : 1;
      fx.crushState.decimation = decimation;
      fx.crushState.reduction = reduction;
      if (fx.crushSupported && fx.crushNode instanceof AudioWorkletNode) {
        const decimationParam = fx.crushNode.parameters.get('decimation');
        const reductionParam = fx.crushNode.parameters.get('reduction');
        decimationParam?.setValueAtTime(decimation, now);
        reductionParam?.setValueAtTime(reduction, now);
      }
      fx.crushBypassGain.gain.setTargetAtTime(bypassGain, now, 0.02);
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
    } catch (error) {
      if (!this.bunkerImpulseWarningLogged) {
        const message = error instanceof Error ? error.message : 'unknown bunker IR load failure';
        console.warn(`[AudioEngine] Falling back to synthetic bunker impulse: ${message}`);
        this.bunkerImpulseWarningLogged = true;
      }
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

  public getAudioStats() {
    const contextWithLatency = this.context as AudioContext & { latencyHint?: AudioContextLatencyCategory | number };
    return {
      sampleRate: this.context.sampleRate,
      contextState: this.context.state,
      latencyHint: contextWithLatency.latencyHint ?? this.latencyHint,
      baseLatency: this.context.baseLatency ?? 0,
    };
  }

  public getDeckAnalyser(deckId: 'A' | 'B'): AnalyserNode | null {
    return this.deckAnalysers[deckId] ?? null;
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

  public setStemMute(deckId: 'A' | 'B', stemType: StemType, isMuted: boolean) {
    this.setStemLevel(deckId, stemType, isMuted ? 0 : 1);
  }

  public setStemLevel(deckId: 'A' | 'B', stemType: StemType, level: number) {
    const deckStemGains = this.stemGains[deckId];
    if (!deckStemGains) return;
    const clamped = Math.max(0, Math.min(1, level));
    const target = AudioEngine.STEM_UNITY_CONTRIBUTION * clamped;
    deckStemGains[stemType].gain.setTargetAtTime(target, this.context.currentTime, 0.01);
  }

  public setStemContribution(
    deckId: 'A' | 'B',
    stemType: StemType,
    contribution: number,
    options?: { rampSeconds?: number; mode?: 'target' | 'linear' }
  ) {
    const deckStemGains = this.stemGains[deckId];
    if (!deckStemGains) return;
    const clamped = Math.max(0, Math.min(AudioEngine.STEM_UNITY_CONTRIBUTION, contribution));
    const now = this.context.currentTime;
    const rampSeconds = Math.max(0, options?.rampSeconds ?? 0.01);
    const gain = deckStemGains[stemType].gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (options?.mode === 'linear') {
      gain.linearRampToValueAtTime(clamped, now + rampSeconds);
      return;
    }
    gain.setTargetAtTime(clamped, now, Math.max(0.001, rampSeconds));
  }

  public setStemFXSend(deckId: 'A' | 'B', stemType: StemType, sendAmount: number) {
    const deckDirectGains = this.stemDirectGains[deckId];
    const deckFxGains = this.stemFxGains[deckId];
    if (!deckDirectGains || !deckFxGains) return;

    const clamped = Math.max(0, Math.min(1, sendAmount));
    const now = this.context.currentTime;
    deckDirectGains[stemType].gain.setTargetAtTime(1 - clamped, now, 0.02);
    deckFxGains[stemType].gain.setTargetAtTime(clamped, now, 0.02);
  }

  public setSplitMonoEnabled(enabled: boolean) {
    this.isSplitMono = enabled;
    const now = this.context.currentTime;
    if (enabled) {
      this.masterPanner.pan.setValueAtTime(-1, now);
      this.cuePanner.pan.setValueAtTime(1, now);
      // Hard-panning mono buses costs ~3 dB of perceived loudness per side, so apply √2 gain
      // compensation to keep headphone monitoring loudness aligned with the stereo mix.
      this.masterMonitorGain.gain.setValueAtTime(1.41, now);
      this.cueMonitorGain.gain.setValueAtTime(1.41, now);
      return;
    }
    this.masterPanner.pan.setValueAtTime(0, now);
    this.cuePanner.pan.setValueAtTime(0, now);
    this.masterMonitorGain.gain.setValueAtTime(1, now);
    this.cueMonitorGain.gain.setValueAtTime(1, now);
  }

  public getSplitMonoEnabled() {
    return this.isSplitMono;
  }

  public setDeckCueEnabled(deckId: 'A' | 'B', enabled: boolean) {
    const cueSend = this.deckCueGains[deckId];
    if (!cueSend) return;
    cueSend.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, 0.01);
  }

  public toggleKeyLock(deckId: 'A' | 'B') {
    const deck = this.decks[deckId];
    const enabled = !deck.keyLockEnabled;
    deck.keyLockEnabled = enabled;
    const supported = this.getPitchLockSupport();
    if (deck.source) {
      this.applyPitchLock(deck.source, deckId);
    }
    return { enabled, supported };
  }

  public setDeckPlaybackRate(deckId: 'A' | 'B', playbackRate: number) {
    const deck = this.decks[deckId];
    const targetRate = Math.max(0.5, Math.min(2.0, playbackRate));
    deck.playbackRate = targetRate;

    if (!deck.source) {
      return;
    }

    const now = this.context.currentTime;
    // Key Lock needs a slightly slower ramp so the browser's pitch-preserving stretch can settle
    // without zipper noise while still feeling responsive on the tempo fader.
    const smoothing = deck.keyLockEnabled
      ? AudioEngine.KEY_LOCK_PLAYBACK_RAMP
      : AudioEngine.DEFAULT_PLAYBACK_RAMP;
    deck.source.playbackRate.cancelScheduledValues(now);
    deck.source.playbackRate.setValueAtTime(deck.source.playbackRate.value, now);
    deck.source.playbackRate.setTargetAtTime(targetRate, now, smoothing);
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

  /**
   * Explicitly disconnects all AudioNodes associated with `deckId`.
   * Call this when a track is unmounted to prevent "setState on unmounted component"
   * warnings and to release Web Audio API resources.
   */
  public disconnectDeck(deckId: 'A' | 'B') {
    const deck = this.decks[deckId];

    // Stop and disconnect the active playback source.
    if (deck.source) {
      try {
        deck.source.stop();
      } catch {
        // Source may already be stopped — ignore.
      }
      deck.source.disconnect();
      deck.source = null;
    }

    // Disconnect stem gain nodes.
    const stemGains = this.stemGains[deckId];
    if (stemGains) {
      stemGains.drums.disconnect();
      stemGains.inst.disconnect();
      stemGains.vocals.disconnect();
    }
    const stemDirectGains = this.stemDirectGains[deckId];
    if (stemDirectGains) {
      stemDirectGains.drums.disconnect();
      stemDirectGains.inst.disconnect();
      stemDirectGains.vocals.disconnect();
    }
    const stemFxGains = this.stemFxGains[deckId];
    if (stemFxGains) {
      stemFxGains.drums.disconnect();
      stemFxGains.inst.disconnect();
      stemFxGains.vocals.disconnect();
    }

    // Disconnect the stem chain input/output.
    const stemChain = this.stemChains[deckId];
    if (stemChain) {
      stemChain.input.disconnect();
      stemChain.output.disconnect();
      stemChain.fxOutput.disconnect();
    }
    const cueSend = this.deckCueGains[deckId];
    if (cueSend) {
      cueSend.disconnect();
    }

    // Disconnect the per-deck analyser.
    const analyser = this.deckAnalysers[deckId];
    if (analyser) {
      analyser.disconnect();
    }

    // Disconnect the FX bus output from the master chain.
    const fxBus = this.deckFxBuses[deckId];
    if (fxBus) {
      fxBus.output.disconnect();
    }
  }

  public getRecordingStream(): MediaStream | null {
    return this.recordingDestination ? this.recordingDestination.stream : null;
  }

  public getRemixBus(): GainNode {
    return this.remixBus;
  }

  public getRecordingProfile() {
    return {
      sampleRate: this.context.sampleRate,
      bitDepth: AudioEngine.TARGET_RECORDING_BIT_DEPTH,
      signalPath: 'post-limiter-master' as const,
    };
  }

  private getPitchLockSupport() {
    const probe = this.context.createBufferSource() as AudioBufferSourceNode & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    return 'preservesPitch' in probe || 'mozPreservesPitch' in probe || 'webkitPreservesPitch' in probe;
  }

  private applyPitchLock(source: AudioBufferSourceNode, deckId: 'A' | 'B') {
    const pitchLockSource = source as AudioBufferSourceNode & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    const enabled = this.decks[deckId].keyLockEnabled;
    if ('preservesPitch' in pitchLockSource) {
      pitchLockSource.preservesPitch = enabled;
    }
    if ('mozPreservesPitch' in pitchLockSource) {
      pitchLockSource.mozPreservesPitch = enabled;
    }
    if ('webkitPreservesPitch' in pitchLockSource) {
      pitchLockSource.webkitPreservesPitch = enabled;
    }
  }

  public getCrossfaderGains(
    crossfaderValue: number,
    curve: 'blend' | 'cut' | 'neural' = 'blend'
  ): { gainA: number; gainB: number } {
    // crossfaderValue ranges from -1 (Deck A) to 1 (Deck B)
    const x = Math.max(0, Math.min(1, (crossfaderValue + 1) / 2)); // 0 -> 1

    if (curve === 'cut') {
      if (x <= 0.05) {
        return { gainA: 1, gainB: 0 };
      }
      if (x >= 0.95) {
        return { gainA: 0, gainB: 1 };
      }
      return { gainA: 1, gainB: 1 };
    }

    if (curve === 'neural') {
      const gainA = Math.sqrt(1 - x);
      const gainB = Math.sqrt(x);
      return { gainA, gainB };
    }

    // Equal power blend curve
    const gainA = Math.cos(x * 0.5 * Math.PI);
    const gainB = Math.cos((1 - x) * 0.5 * Math.PI);
    return { gainA, gainB };
  }

  private startPerformanceLoop(
    deckId: 'A' | 'B',
    loopStart: number,
    originTime: number,
    loopDuration: number,
    mode: 'slip-roll' | 'beat-break',
    playbackRateMultiplier = 1
  ) {
    const deck = this.decks[deckId];
    if (!deck?.buffer || !deck.stemInput || !deck.deckGain) return null;

    const now = this.context.currentTime;
    const safeLoopStart = Math.max(0, Math.min(loopStart, deck.buffer.duration));
    const safeLoopDuration = Math.max(
      AudioEngine.MIN_PERFORMANCE_LOOP_DURATION,
      Math.min(
        loopDuration,
        Math.max(AudioEngine.MIN_PERFORMANCE_LOOP_DURATION, deck.buffer.duration - safeLoopStart)
      )
    );
    const freshSource = this.createPitchLockedSource(deckId, deck.buffer);

    this.performanceLoops[deckId] = {
      mode,
      originTime: Math.max(0, Math.min(originTime, deck.buffer.duration)),
      loopStart: safeLoopStart,
      loopDuration: safeLoopDuration,
      startedAtContextTime: now + 0.002,
      wasPlaying: deck.isPlaying,
    };

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

    freshSource.loop = true;
    freshSource.loopStart = safeLoopStart;
    freshSource.loopEnd = Math.min(deck.buffer.duration, safeLoopStart + safeLoopDuration);
    freshSource.playbackRate.value = deck.playbackRate * playbackRateMultiplier;
    freshSource.connect(deck.stemInput);
    freshSource.start(now + 0.002, safeLoopStart);

    deck.deckGain.gain.setValueAtTime(0, now + 0.002);
    deck.deckGain.gain.linearRampToValueAtTime(1, now + 0.004);

    deck.source = freshSource;
    deck.isPlaying = true;
    deck.pauseTime = safeLoopStart;
    deck.currentTime = safeLoopStart;
    deck.onSourceSwap?.(freshSource);
    deck.onPauseTime?.(safeLoopStart);

    return freshSource;
  }

  public startSlipRoll(deckId: 'A' | 'B', loopStart: number, originTime: number, bpm: number, beatFraction = 0.25) {
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const safeBeatFraction = Math.max(0.125, Math.min(1, beatFraction));
    return this.startPerformanceLoop(deckId, loopStart, originTime, (60 / safeBpm) * safeBeatFraction, 'slip-roll');
  }

  public stopSlipRoll(deckId: 'A' | 'B') {
    this.stopPerformanceLoop(deckId);
  }

  public startBeatBreak(deckId: 'A' | 'B', loopStart: number, originTime: number, bpm: number) {
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    // Slow the loop slightly for a classic beat-break tug before slipping back to the live timeline.
    return this.startPerformanceLoop(deckId, loopStart, originTime, (60 / safeBpm) * 0.5, 'beat-break', 0.92);
  }

  public stopBeatBreak(deckId: 'A' | 'B') {
    this.stopPerformanceLoop(deckId);
  }

  private stopPerformanceLoop(deckId: 'A' | 'B') {
    const deck = this.decks[deckId];
    const loop = this.performanceLoops[deckId];
    if (!deck?.deckGain) return;

    const now = this.context.currentTime;
    const elapsed = Math.max(0, now - loop.startedAtContextTime);
    const resumeTime = deck.buffer
      ? Math.max(0, Math.min(loop.originTime + elapsed * deck.playbackRate, deck.buffer.duration))
      : loop.originTime;

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

    if (loop.wasPlaying && deck.buffer && deck.stemInput) {
      const resumeSource = this.createPitchLockedSource(deckId, deck.buffer);
      resumeSource.playbackRate.value = deck.playbackRate;
      resumeSource.connect(deck.stemInput);
      resumeSource.start(now + 0.002, resumeTime);

      deck.deckGain.gain.setValueAtTime(0, now + 0.002);
      deck.deckGain.gain.linearRampToValueAtTime(1, now + 0.004);
      deck.source = resumeSource;
      deck.isPlaying = true;
      deck.pauseTime = resumeTime;
      deck.currentTime = resumeTime;
      deck.onSourceSwap?.(resumeSource);
      deck.onPauseTime?.(resumeTime);
    } else {
      deck.isPlaying = false;
      deck.pauseTime = resumeTime;
      deck.currentTime = resumeTime;
      deck.onPauseTime?.(resumeTime);
    }

    this.performanceLoops[deckId] = {
      mode: null,
      originTime: 0,
      loopStart: 0,
      loopDuration: 0,
      startedAtContextTime: 0,
      wasPlaying: false,
    };
  }
}
