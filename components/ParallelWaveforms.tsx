'use client';

import { memo, useEffect, useRef } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useUIStore } from '@/store/uiStore';
import { AudioEngine } from '@/lib/audioEngine';

type DeckSnapshot = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  bpm: number;
  buffer: AudioBuffer | null;
};

interface FrequencyRGB {
  red: number;
  green: number;
  blue: number;
}

/** Default RGB fallback when no analyser is available (dim gray waveform) */
const DEFAULT_RGB = 80;

/** Beats per phrase marker (4 bars × 4 beats = 16 beats) */
const BEATS_PER_PHRASE_MARKER = 16;
/** Beat-phase tolerance for the ghost playhead lock indicator (~20ms at 120 BPM because 0.04 × 500ms = 20ms). */
const PHASE_ALIGNMENT_TOLERANCE = 0.04;

/**
 * Maximum width for the off-screen background canvas.
 * Keeps memory within safe bounds across browsers (including Safari).
 * At zoom=100 px/s this covers ~80 minutes of audio without compression.
 */
const OFFSCREEN_MAX_WIDTH = 8192;

// ---------------------------------------------------------------------------
// Module-level helpers (defined outside the component to avoid re-creation)
// ---------------------------------------------------------------------------

function getFrequencyDataFromAnalyser(analyser: AnalyserNode | null): FrequencyRGB {
  if (!analyser) return { red: DEFAULT_RGB, green: DEFAULT_RGB, blue: DEFAULT_RGB };
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const lowEnd = dataArray.slice(0, Math.floor(bufferLength * 0.1));
  const midRange = dataArray.slice(Math.floor(bufferLength * 0.1), Math.floor(bufferLength * 0.5));
  const highEnd = dataArray.slice(Math.floor(bufferLength * 0.5));

  const average = (arr: Uint8Array) => {
    if (arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  };

  return {
    red: average(lowEnd),
    green: average(midRange),
    blue: average(highEnd),
  };
}

/** Zero-crossing rate threshold below which a bar is classified as bass */
const ZCR_BASS_THRESHOLD = 0.1;
/** Zero-crossing rate threshold below which a bar is classified as mid (above = high) */
const ZCR_MID_THRESHOLD = 0.3;
/** Waveform bar color for bass-dominant regions */
const COLOR_BASS = '#FF003C';
/** Waveform bar color for mid-dominant regions */
const COLOR_MID = '#FFD700';
/** Waveform bar color for high-dominant regions */
const COLOR_HIGH = '#FFFFFF';

/**
 * Determines the color of a waveform bar based on zero-crossing rate analysis.
 * Low ZCR → bass → Crimson, Medium → Gold, High → White.
 */
function getBarColor(samples: Float32Array, right: Float32Array | null, start: number, count: number): string {
  let zeroCrossings = 0;
  for (let i = 1; i < count && (start + i) < samples.length; i++) {
    const current = right ? (samples[start + i] + right[start + i]) * 0.5 : samples[start + i];
    const prev = right ? (samples[start + i - 1] + right[start + i - 1]) * 0.5 : samples[start + i - 1];
    if ((current >= 0) !== (prev >= 0)) zeroCrossings++;
  }
  const zcr = zeroCrossings / count;
  if (zcr < ZCR_BASS_THRESHOLD) return COLOR_BASS;
  if (zcr < ZCR_MID_THRESHOLD) return COLOR_MID;
  return COLOR_HIGH;
}

/**
 * Maximum number of audio samples to process per animation frame.
 * Keeps each chunk well under the 16 ms frame budget so the UI stays responsive
 * while the waveform progressively paints itself onto the off-screen canvas.
 */
const SAMPLES_PER_CHUNK = 100_000;

/**
 * Renders the complete waveform for `buffer` into a new off-screen HTMLCanvasElement
 * using a **chunked requestAnimationFrame loop**.
 *
 * Instead of blocking the main thread for the entire buffer, it processes
 * ~SAMPLES_PER_CHUNK samples per frame and yields, so the UI remains responsive
 * while the waveform progressively paints itself.
 *
 * Bars are drawn in white (for later `multiply` compositing) at full opacity so that
 * the RGB overlay step can tint them to any colour without baking the live frequency
 * data into this cached layer.
 *
 * Called ONLY when the audio buffer or zoom level changes — never on every frame.
 *
 * @returns An object with the (initially blank) `canvas` and a `cancel` function.
 *          The canvas is drawn into progressively and can be blitted each render
 *          frame even before the build finishes.
 */
function buildBackgroundCanvasChunked(
  buffer: AudioBuffer,
  height: number,
  pps: number,
  isTop: boolean,
): { canvas: HTMLCanvasElement; cancel: () => void } {
  const totalWidth = Math.max(1, Math.ceil(buffer.duration * pps));
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, cancel: () => {} };

  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const centerY = height / 2;
  const amp = height * 0.48;
  const barWidth = 2;
  const samplesPerBar = Math.max(1, Math.floor((barWidth / pps) * buffer.sampleRate));
  const barsPerChunk = Math.max(1, Math.floor(SAMPLES_PER_CHUNK / samplesPerBar));

  let currentX = 0;
  let frameId = 0;
  let cancelled = false;

  const processChunk = () => {
    if (cancelled) return;

    const chunkEndX = Math.min(totalWidth, currentX + barsPerChunk * barWidth);

    for (let x = currentX; x < chunkEndX; x += barWidth) {
      const timeAtPixel = x / pps;
      if (timeAtPixel > buffer.duration) {
        currentX = totalWidth;
        return; // done
      }

      const sampleStart = Math.floor(timeAtPixel * buffer.sampleRate);
      let max = 0;
      for (let i = 0; i < samplesPerBar; i++) {
        const idx = sampleStart + i;
        if (idx >= left.length) break;
        const sample = right ? (left[idx] + right[idx]) * 0.5 : left[idx];
        const abs = Math.abs(sample);
        if (abs > max) max = abs;
      }

      // Per-bar frequency coloring via zero-crossing rate analysis
      const barColor = getBarColor(left, right, sampleStart, samplesPerBar);
      ctx.fillStyle = barColor;

      const barHeight = max * amp;
      if (isTop) {
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
      } else {
        ctx.fillRect(x, centerY, barWidth, barHeight);
      }
    }

    currentX = chunkEndX;

    if (currentX < totalWidth) {
      frameId = requestAnimationFrame(processChunk);
    }
  };

  frameId = requestAnimationFrame(processChunk);

  return {
    canvas,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    },
  };
}

/**
 * Blits the portion of `bgCanvas` that corresponds to the current playhead position
 * onto `ctx`. Handles clamping when the playhead is near the start or end of the track.
 *
 * bgPPS  – the pixels-per-second at which the background canvas was rendered.
 * zoom   – the current display zoom (pixels per second on the visible canvas).
 */
function blitBackgroundWindow(
  ctx: CanvasRenderingContext2D,
  bgCanvas: HTMLCanvasElement,
  bgPPS: number,
  playhead: number,
  destWidth: number,
  destHeight: number,
  destY: number,
  zoom: number,
): void {
  // In background-canvas coordinates the playhead sits at `playhead * bgPPS`.
  // The visible window covers `destWidth / zoom` seconds → `destWidth * (bgPPS / zoom)` bg-pixels.
  const bgPlayheadX = playhead * bgPPS;
  const bgHalfWindow = (destWidth / 2) * (bgPPS / zoom);
  const bgSrcX = bgPlayheadX - bgHalfWindow;
  const bgSrcWidth = destWidth * (bgPPS / zoom);

  // Clamp to the background canvas bounds.
  const clampedSrcX = Math.max(0, bgSrcX);
  const clampedSrcRight = Math.min(bgCanvas.width, bgSrcX + bgSrcWidth);
  const clampedSrcWidth = clampedSrcRight - clampedSrcX;

  if (clampedSrcWidth <= 0 || bgSrcWidth <= 0) return;

  // Map the clamped source region back to a destination region.
  const leftCrop = clampedSrcX - bgSrcX;
  const destXOffset = (leftCrop / bgSrcWidth) * destWidth;
  const destActualWidth = (clampedSrcWidth / bgSrcWidth) * destWidth;

  ctx.drawImage(
    bgCanvas,
    clampedSrcX, 0, clampedSrcWidth, destHeight,
    destXOffset, destY, destActualWidth, destHeight,
  );
}

function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  yOffset: number,
  bpm: number,
  playhead: number,
  pixelsPerSecond: number,
): void {
  const secondsPerBeat = 60 / (bpm || 120);
  const pixelsPerBeat = secondsPerBeat * pixelsPerSecond;
  const centerX = width / 2;
  const beatsToDraw = Math.ceil(width / pixelsPerBeat) + 4;
  const currentBeatIndex = Math.floor(playhead / secondsPerBeat);

  for (let i = -beatsToDraw; i <= beatsToDraw; i++) {
    const beatIndex = currentBeatIndex + i;
    const beatTime = beatIndex * secondsPerBeat;
    const x = centerX + (beatTime - playhead) * pixelsPerSecond;
    if (x < 0 || x > width) continue;

    const isDownbeat = beatIndex % 4 === 0;
    const isPhraseStart = beatIndex % BEATS_PER_PHRASE_MARKER === 0;
    ctx.save();
    if (isPhraseStart) {
      ctx.strokeStyle = 'rgba(255,215,0,0.7)';
      ctx.lineWidth = 2.5;
    } else if (isDownbeat) {
      ctx.strokeStyle = 'rgba(212,175,55,0.5)';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
    }
    ctx.beginPath();
    ctx.moveTo(x, yOffset);
    ctx.lineTo(x, yOffset + height);
    ctx.stroke();

    // Draw bar number labels on phrase starts
    if (isPhraseStart) {
      ctx.fillStyle = 'rgba(255,215,0,0.6)';
      ctx.font = '9px monospace';
      ctx.fillText(`${Math.floor(beatIndex / 4) + 1}`, x + 3, yOffset + 10);
    }
    ctx.restore();
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, width: number, height: number, isPhaseAligned?: boolean): void {
  const centerPixel = width / 2;
  const color = isPhaseAligned ? '#00FF00' : '#ffffff';
  ctx.shadowColor = color;
  ctx.shadowBlur = isPhaseAligned ? 20 : 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(centerPixel, 0);
  ctx.lineTo(centerPixel, height);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(centerPixel, height / 2 - 6);
  ctx.lineTo(centerPixel + 6, height / 2);
  ctx.lineTo(centerPixel, height / 2 + 6);
  ctx.lineTo(centerPixel - 6, height / 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function getPhaseAlignment(
  playheadA: number,
  bpmA: number,
  playheadB: number,
  bpmB: number,
): { offset: number; isAligned: boolean } {
  const safeBpmA = Number.isFinite(bpmA) && bpmA > 0 ? bpmA : 120;
  const safeBpmB = Number.isFinite(bpmB) && bpmB > 0 ? bpmB : 120;
  const beatFracA = ((playheadA / (60 / safeBpmA)) % 1 + 1) % 1;
  const beatFracB = ((playheadB / (60 / safeBpmB)) % 1 + 1) % 1;
  const rawOffset = Math.abs(beatFracA - beatFracB);
  const offset = Math.min(rawOffset, 1 - rawOffset);
  return {
    offset,
    isAligned: offset < PHASE_ALIGNMENT_TOLERANCE,
  };
}

function drawGhostPlayhead(
  ctx: CanvasRenderingContext2D,
  width: number,
  yOffset: number,
  height: number,
  relativeSeconds: number,
  pixelsPerSecond: number,
  aligned: boolean,
): void {
  const x = width / 2 + relativeSeconds * pixelsPerSecond;
  if (x < 0 || x > width) return;

  ctx.save();
  ctx.strokeStyle = aligned ? 'rgba(34,197,94,0.85)' : 'rgba(255,0,60,0.85)';
  ctx.shadowColor = aligned ? 'rgba(34,197,94,0.95)' : 'rgba(255,0,60,0.95)';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(x, yOffset + 2);
  ctx.lineTo(x, yOffset + height - 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dual-deck waveform display using a two-layer canvas strategy:
 *
 * 1. Off-screen background canvas (one per deck): pre-renders the complete waveform shape
 *    in white.  This expensive per-sample loop runs ONLY when the audio buffer or zoom
 *    changes — never on every animation frame.
 *
 * 2. Visible (foreground) canvas: each RAF tick blits the relevant window from the
 *    background canvas via `drawImage`, applies a live-frequency RGB colour tint using
 *    canvas `multiply` compositing, then draws the beat grid and playhead on top.
 */
export const ParallelWaveforms = memo(function ParallelWaveforms({ compact = false }: Readonly<{ compact?: boolean }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoom = useUIStore((state) => state.waveformZoom);
  const setZoom = useUIStore((state) => state.setWaveformZoom);
  const isPerformanceMode = useUIStore((state) => state.isPerformanceMode);

  const deckARef = useRef<DeckSnapshot>({
    currentTime: useDeckStore.getState().deckA.currentTime,
    duration: useDeckStore.getState().deckA.duration,
    isPlaying: useDeckStore.getState().deckA.isPlaying,
    bpm: Number(useDeckStore.getState().deckA.track?.bpm) || 120,
    buffer: useDeckStore.getState().deckA.buffer,
  });
  const deckBRef = useRef<DeckSnapshot>({
    currentTime: useDeckStore.getState().deckB.currentTime,
    duration: useDeckStore.getState().deckB.duration,
    isPlaying: useDeckStore.getState().deckB.isPlaying,
    bpm: Number(useDeckStore.getState().deckB.track?.bpm) || 120,
    buffer: useDeckStore.getState().deckB.buffer,
  });

  // Live frequency data — written each frame, never triggers React re-renders.
  const rgbARef = useRef<FrequencyRGB>({ red: DEFAULT_RGB, green: DEFAULT_RGB, blue: DEFAULT_RGB });
  const rgbBRef = useRef<FrequencyRGB>({ red: DEFAULT_RGB, green: DEFAULT_RGB, blue: DEFAULT_RGB });

  /**
   * Off-screen canvas cache.
   * The expensive chunked waveform build is skipped unless buffer, zoom, or
   * canvas height has changed since the last build.
   */
  const bgBuildCancelRef = useRef<{
    cancelA?: () => void;
    cancelB?: () => void;
  }>({});

  const bgStateRef = useRef<{
    canvasA: HTMLCanvasElement | null;
    canvasB: HTMLCanvasElement | null;
    bufferA: AudioBuffer | null;
    bufferB: AudioBuffer | null;
    zoom: number;
    halfHeight: number;
    ppsA: number;
    ppsB: number;
  }>({
    canvasA: null,
    canvasB: null,
    bufferA: null,
    bufferB: null,
    zoom: 0,
    halfHeight: 0,
    ppsA: 0,
    ppsB: 0,
  });

  // Mirror Zustand deck state into refs so the RAF loop can read it without causing re-renders.
  useEffect(() => {
    const unsubA = useDeckStore.subscribe((state) => {
      const d = state.deckA;
      deckARef.current = {
        currentTime: d.currentTime,
        duration: d.duration,
        isPlaying: d.isPlaying,
        bpm: Number(d.track?.bpm) || 120,
        buffer: d.buffer,
      };
    });
    const unsubB = useDeckStore.subscribe((state) => {
      const d = state.deckB;
      deckBRef.current = {
        currentTime: d.currentTime,
        duration: d.duration,
        isPlaying: d.isPlaying,
        bpm: Number(d.track?.bpm) || 120,
        buffer: d.buffer,
      };
    });

    return () => {
      unsubA();
      unsubB();
    };
  }, []);

  // Main render loop — recreated when zoom changes so the closure stays current.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Capture the mutable build-cancel bag once so the cleanup closure satisfies
    // the react-hooks/exhaustive-deps rule (same object, mutated in place).
    const buildCancels = bgBuildCancelRef.current;

    let animationFrameId: number;
    let lastTime = performance.now();

    let playheadA = deckARef.current.currentTime;
    let playheadB = deckBRef.current.currentTime;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const engine = AudioEngine.getInstance();

    const renderLoop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const snapA = deckARef.current;
      const snapB = deckBRef.current;

      if (snapA.isPlaying) playheadA += dt;
      else playheadA = snapA.currentTime;

      if (snapB.isPlaying) playheadB += dt;
      else playheadB = snapB.currentTime;

      // Update live frequency data into refs (no React state, no re-renders).
      rgbARef.current = getFrequencyDataFromAnalyser(engine.getDeckAnalyser('A'));
      rgbBRef.current = getFrequencyDataFromAnalyser(engine.getDeckAnalyser('B'));

      const width = canvas.width;
      const height = canvas.height;
      const halfHeight = height / 2;
      const pixelsPerSecond = zoom;
      const phaseAlignment = getPhaseAlignment(playheadA, snapA.bpm, playheadB, snapB.bpm);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      // -----------------------------------------------------------------------
      // Off-screen background cache: rebuild ONLY when buffer, zoom, or canvas
      // height changes.  This guard ensures the per-sample waveform loop never
      // runs on a regular animation frame.
      // -----------------------------------------------------------------------
      const bg = bgStateRef.current;

      const needsA =
        bg.bufferA !== snapA.buffer ||
        bg.zoom !== pixelsPerSecond ||
        bg.halfHeight !== halfHeight;

      const needsB =
        bg.bufferB !== snapB.buffer ||
        bg.zoom !== pixelsPerSecond ||
        bg.halfHeight !== halfHeight;

      if (needsA) {
        buildCancels.cancelA?.();
        if (snapA.buffer) {
          // Cap pps so the background canvas never exceeds OFFSCREEN_MAX_WIDTH.
          const pps = Math.min(pixelsPerSecond, OFFSCREEN_MAX_WIDTH / snapA.buffer.duration);
          const { canvas, cancel } = buildBackgroundCanvasChunked(snapA.buffer, halfHeight, pps, true);
          bg.canvasA = canvas;
          bg.ppsA = pps;
          buildCancels.cancelA = cancel;
        } else {
          bg.canvasA = null;
          bg.ppsA = pixelsPerSecond;
          buildCancels.cancelA = undefined;
        }
        bg.bufferA = snapA.buffer;
      }

      if (needsB) {
        buildCancels.cancelB?.();
        if (snapB.buffer) {
          const pps = Math.min(pixelsPerSecond, OFFSCREEN_MAX_WIDTH / snapB.buffer.duration);
          const { canvas, cancel } = buildBackgroundCanvasChunked(snapB.buffer, halfHeight, pps, false);
          bg.canvasB = canvas;
          bg.ppsB = pps;
          buildCancels.cancelB = cancel;
        } else {
          bg.canvasB = null;
          bg.ppsB = pixelsPerSecond;
          buildCancels.cancelB = undefined;
        }
        bg.bufferB = snapB.buffer;
      }

      if (needsA || needsB) {
        bg.zoom = pixelsPerSecond;
        bg.halfHeight = halfHeight;
      }

      // -----------------------------------------------------------------------
      // Render: clear → blit background → edge-fade → RGB overlay → grid → playhead
      // -----------------------------------------------------------------------
      ctx.clearRect(0, 0, width, height);

      // 1. Blit the cached background waveform (white bars) for each deck half.
      if (bg.canvasA) {
        blitBackgroundWindow(ctx, bg.canvasA, bg.ppsA, playheadA, width, halfHeight, 0, pixelsPerSecond);
      }
      if (bg.canvasB) {
        blitBackgroundWindow(ctx, bg.canvasB, bg.ppsB, playheadB, width, halfHeight, halfHeight, pixelsPerSecond);
      }

      // 2. Edge-fade: cut waveform opacity at screen edges using destination-out so
      //    bars near the playhead appear most prominent (mirrors the original per-bar
      //    alpha = 1 - distFromCenter * 0.4 behaviour).
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const fadeGrad = ctx.createLinearGradient(0, 0, width, 0);
      fadeGrad.addColorStop(0, 'rgba(0,0,0,0.40)');
      fadeGrad.addColorStop(0.30, 'rgba(0,0,0,0)');
      fadeGrad.addColorStop(0.70, 'rgba(0,0,0,0)');
      fadeGrad.addColorStop(1, 'rgba(0,0,0,0.40)');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // 3. Live RGB colour overlay: `multiply` tints the white bars with the current
      //    frequency energy colour.  White × rgb = rgb; transparent × rgb = transparent.
      const rgbA = rgbARef.current;
      const rgbB = rgbBRef.current;
      const rA = Math.min(255, Math.floor(rgbA.red * 1.2));
      const gA = Math.min(255, Math.floor(rgbA.green * 1.2));
      const bA = Math.min(255, Math.floor(rgbA.blue * 1.2));
      const rB = Math.min(255, Math.floor(rgbB.red * 1.2));
      const gB = Math.min(255, Math.floor(rgbB.green * 1.2));
      const bB = Math.min(255, Math.floor(rgbB.blue * 1.2));

      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${rA}, ${gA}, ${bA})`;
      ctx.fillRect(0, 0, width, halfHeight);
      ctx.fillStyle = `rgb(${rB}, ${gB}, ${bB})`;
      ctx.fillRect(0, halfHeight, width, halfHeight);
      ctx.restore();

      // 4. Beat grid and centre divider — normal compositing, above the waveform.
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      drawBeatGrid(ctx, width, halfHeight, 0, snapA.bpm, playheadA, pixelsPerSecond);
      drawBeatGrid(ctx, width, halfHeight, halfHeight, snapB.bpm, playheadB, pixelsPerSecond);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, halfHeight - 1, width, 2);
      ctx.restore();

      // 5. Ghost playheads + phase lock indicator — drawn from the opposite deck without React state.
      drawGhostPlayhead(ctx, width, 0, halfHeight, playheadB - playheadA, pixelsPerSecond, phaseAlignment.isAligned);
      drawGhostPlayhead(ctx, width, halfHeight, halfHeight, playheadA - playheadB, pixelsPerSecond, phaseAlignment.isAligned);

      // 6. Playhead — always on top of everything.
      drawPlayhead(ctx, width, height, phaseAlignment.isAligned);

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
      buildCancels.cancelA?.();
      buildCancels.cancelB?.();
    };
  }, [zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((prev) => Math.min(Math.max(prev + event.deltaY * -0.1, 20), 300));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [setZoom]);

  const heightClass = isPerformanceMode
    ? (compact ? 'h-24' : 'h-48 md:h-64 xl:h-80')
    : (compact ? 'h-12' : 'h-24 md:h-32 xl:h-40');

  return (
    <div
      ref={containerRef}
      className={`${heightClass} w-full flex-shrink-0 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl border-b-accent/20 overflow-hidden relative transition-all duration-300`}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
});
