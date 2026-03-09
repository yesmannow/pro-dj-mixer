export class AudioEngine {
  private static instance: AudioEngine;
  public context: AudioContext;
  private deckFxBuses: Partial<Record<'A' | 'B', {
    input: GainNode;
    output: GainNode;
    dryGain: GainNode;
    wetGain: GainNode;
    delayNode: DelayNode;
    delayFeedbackGain: GainNode;
    delayMixGain: GainNode;
    reverbNode: ConvolverNode;
    reverbMixGain: GainNode;
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

  private createImpulseResponse(seconds = 1.6, decay = 2.5) {
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const impulse = this.context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }

    return impulse;
  }

  public createDeckFxBus(deckId: 'A' | 'B') {
    if (this.deckFxBuses[deckId]) {
      return this.deckFxBuses[deckId];
    }

    const input = this.context.createGain();
    const output = this.context.createGain();
    const dryGain = this.context.createGain();
    const wetGain = this.context.createGain();

    const delayNode = this.context.createDelay(2);
    const delayFeedbackGain = this.context.createGain();
    const delayMixGain = this.context.createGain();

    const reverbNode = this.context.createConvolver();
    reverbNode.buffer = this.createImpulseResponse();
    const reverbMixGain = this.context.createGain();

    output.gain.value = 0.9;
    delayNode.delayTime.value = 0.25;
    delayFeedbackGain.gain.value = 0.25;
    delayMixGain.gain.value = 0.55;
    reverbMixGain.gain.value = 0.45;

    input.connect(dryGain);
    dryGain.connect(output);

    input.connect(delayNode);
    delayNode.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delayNode);
    delayNode.connect(delayMixGain);
    delayMixGain.connect(wetGain);

    input.connect(reverbNode);
    reverbNode.connect(reverbMixGain);
    reverbMixGain.connect(wetGain);
    wetGain.connect(output);

    const bus = {
      input,
      output,
      dryGain,
      wetGain,
      delayNode,
      delayFeedbackGain,
      delayMixGain,
      reverbNode,
      reverbMixGain
    };
    this.deckFxBuses[deckId] = bus;
    this.setDeckFxMix(deckId, 0);
    return bus;
  }

  public setDeckFxMix(deckId: 'A' | 'B', mix: number) {
    const fx = this.deckFxBuses[deckId];
    if (!fx) return;
    const clamped = Math.max(0, Math.min(1, mix));
    const now = this.context.currentTime;
    const dry = Math.cos(clamped * 0.5 * Math.PI);
    const wet = Math.sin(clamped * 0.5 * Math.PI);
    fx.dryGain.gain.setTargetAtTime(dry, now, 0.015);
    fx.wetGain.gain.setTargetAtTime(wet, now, 0.015);
  }

  public setDeckDelay(deckId: 'A' | 'B', time: number, feedback: number, mix: number) {
    const fx = this.deckFxBuses[deckId];
    if (!fx) return;
    const now = this.context.currentTime;
    const clampedTime = Math.max(0.02, Math.min(2, time));
    const clampedFeedback = Math.max(0, Math.min(0.92, feedback));
    fx.delayNode.delayTime.setTargetAtTime(clampedTime, now, 0.02);
    fx.delayFeedbackGain.gain.setTargetAtTime(clampedFeedback, now, 0.02);
    fx.delayMixGain.gain.setTargetAtTime(Math.max(0, Math.min(1, mix)), now, 0.02);
    this.setDeckFxMix(deckId, mix);
  }

  public setDeckReverb(deckId: 'A' | 'B', mix: number) {
    const fx = this.deckFxBuses[deckId];
    if (!fx) return;
    const clampedMix = Math.max(0, Math.min(1, mix));
    fx.reverbMixGain.gain.setTargetAtTime(clampedMix, this.context.currentTime, 0.02);
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
