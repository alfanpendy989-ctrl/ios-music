import type { PlayerRenderer, Scene } from '../renderer/PlayerRenderer';

export interface ExportOptions {
  renderer: PlayerRenderer;
  scene: Scene;
  /** audio yang sudah di-decode (48 kHz) */
  buffer: AudioBuffer;
  /** rentang dalam detik pada lagu */
  start: number;
  end: number;
  /** durasi lagu penuh (untuk progress bar di dalam video) */
  duration: number;
  volume: number;
  width: number;
  height: number;
  fps: number;
}

export interface ExportProgress {
  /** 0..1 */
  ratio: number;
  stage: string;
}

export type ProgressFn = (p: ExportProgress) => void;

export type ExportMethod = 'webcodecs' | 'webcodecs+ffmpeg' | 'recorder';

export interface ExportResult {
  blob: Blob;
  method: ExportMethod;
}

export class ExportError extends Error {}

export function abortError(): DOMException {
  return new DOMException('Ekspor dibatalkan', 'AbortError');
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

/** Beri giliran ke event loop tanpa kena throttle setTimeout di tab latar. */
export function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
}
