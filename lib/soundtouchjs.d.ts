/**
 * Minimal type declarations for soundtouchjs v0.3.x
 * Full docs: https://github.com/cutterbl/SoundTouchJS
 */
declare module 'soundtouchjs' {
  /** Interface that custom audio sources must implement. */
  export interface SoundTouchSource {
    /**
     * Fill `target` (interleaved stereo Float32Array) with `numFrames` frames
     * starting at `position` in the source. Returns the number of frames written.
     */
    extract(target: Float32Array, numFrames: number, position: number): number;
  }

  /** WSOLA-based pitch-invariant time-stretching engine. */
  export class SoundTouch {
    /** Playback tempo multiplier (1.0 = original speed). */
    tempo: number;
    /** Pitch shift multiplier (1.0 = original pitch). */
    pitch: number;
    /** Combined rate multiplier (changes both tempo and pitch). */
    rate: number;
    /** Clear internal processing buffers (e.g. after a seek). */
    clear(): void;
  }

  /**
   * Connects a custom source to a SoundTouch processor, managing the
   * input/output FIFO buffers and source position tracking.
   */
  export class SimpleFilter {
    /**
     * @param sourceSound - Object implementing SoundTouchSource.extract()
     * @param pipe        - A SoundTouch instance.
     * @param historyBufferSize - Optional history buffer size (default 22050).
     */
    constructor(sourceSound: SoundTouchSource, pipe: SoundTouch, historyBufferSize?: number);

    /** Current read position in the source (in frames). Setting seeks to that frame. */
    sourcePosition: number;

    /**
     * Extract up to `numFrames` processed frames into `target`
     * (interleaved stereo Float32Array). Returns actual frames written.
     */
    extract(target: Float32Array, numFrames: number): number;

    /** Clear internal buffers (called automatically when sourcePosition is set). */
    clear(): void;
  }

  /**
   * Convenience source adapter that wraps an AudioBuffer for use with SimpleFilter.
   */
  export class WebAudioBufferSource implements SoundTouchSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames: number, position: number): number;
  }

  /**
   * Creates a ScriptProcessorNode that pipes `filter` output to the Web Audio graph.
   * @param context   - AudioContext to create the node in.
   * @param filter    - A SimpleFilter (or compatible) instance.
   * @param sourcePositionCallback - Called with the current source position after each block.
   * @param bufferSize - ScriptProcessor block size (default 4096).
   */
  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    sourcePositionCallback?: (sourcePosition: number) => void,
    bufferSize?: number,
  ): ScriptProcessorNode;
}
