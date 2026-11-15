import { encodeWav, slicePcm } from './frames';
import { recordRealtime, recorderSupported } from './recorder';
import {
  ExportError,
  throwIfAborted,
  type ExportMethod,
  type ExportOptions,
  type ExportResult,
  type ProgressFn,
} from './types';
import { detectWebCodecs, encodeWithWebCodecs } from './webcodecs';

export const EXPORT_SAMPLE_RATE = 48000;

/** Decode file audio menjadi PCM 48 kHz (untuk mux & analisis equalizer). */
export async function decodeAudio(file: Blob): Promise<AudioBuffer> {
  const Offline: typeof OfflineAudioContext | undefined =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new ExportError('Browser ini tidak mendukung Web Audio API.');
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new ExportError('File audio tidak bisa dibaca (mungkin terlalu besar untuk memori browser).');
  }
  try {
    return await new Offline(2, 1, EXPORT_SAMPLE_RATE).decodeAudioData(data);
  } catch {
    throw new ExportError('Audio gagal di-decode: format tidak didukung browser ini.');
  }
}

/** Jalur ekspor yang akan dipakai browser ini (untuk ditampilkan di UI). */
export async function detectExportMethod(width: number, height: number, fps: number): Promise<ExportMethod | null> {
  const wc = await detectWebCodecs(width, height, fps, EXPORT_SAMPLE_RATE);
  if (wc) return wc.audio ? 'webcodecs' : 'webcodecs+ffmpeg';
  return recorderSupported() ? 'recorder' : null;
}

/**
 * Ekspor video. Urutan jalur:
 *  1. WebCodecs H.264 + AAC → mp4-muxer (offline, tercepat)
 *  2. WebCodecs H.264 tanpa encoder AAC → video dirender offline, audio
 *     di-encode ke AAC dan digabung oleh ffmpeg.wasm (video disalin apa adanya)
 *  3. Tanpa WebCodecs → MediaRecorder (realtime) → ffmpeg.wasm ke MP4
 */
export async function exportVideo(opts: ExportOptions, onProgress: ProgressFn, signal: AbortSignal): Promise<ExportResult> {
  const length = opts.end - opts.start;
  if (!(length > 0.05)) throw new ExportError('Rentang ekspor tidak valid.');
  throwIfAborted(signal);

  const support = await detectWebCodecs(opts.width, opts.height, opts.fps, opts.buffer.sampleRate);

  if (support?.audio) {
    const blob = await encodeWithWebCodecs(opts, support, onProgress, signal);
    return { blob, method: 'webcodecs' };
  }

  if (support) {
    const video = await encodeWithWebCodecs(
      opts,
      support,
      (p) => onProgress({ ratio: p.ratio * 0.85, stage: p.stage }),
      signal,
    );
    const [l, r] = slicePcm(opts.buffer, opts.start, opts.end);
    const { runFfmpeg } = await import('./ffmpeg');
    const out = await runFfmpeg(
      [
        { name: 'video.mp4', data: new Uint8Array(await video.arrayBuffer()) },
        { name: 'audio.wav', data: encodeWav(l, r, opts.buffer.sampleRate) },
      ],
      ['-i', 'video.mp4', '-i', 'audio.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4'],
      'out.mp4',
      length,
      (p) => onProgress({ ratio: 0.85 + p.ratio * 0.15, stage: p.stage }),
      signal,
      'Menggabungkan audio (AAC)…',
    );
    return { blob: new Blob([out as BlobPart], { type: 'video/mp4' }), method: 'webcodecs+ffmpeg' };
  }

  if (!recorderSupported()) {
    throw new ExportError(
      'Browser ini tidak mendukung WebCodecs maupun MediaRecorder. Gunakan Chrome, Edge, atau Safari versi terbaru.',
    );
  }
  const recorded = await recordRealtime(opts, (p) => onProgress({ ratio: p.ratio * 0.5, stage: p.stage }), signal);
  if (recorded.type.includes('mp4')) return { blob: recorded, method: 'recorder' };

  const { runFfmpeg } = await import('./ffmpeg');
  const out = await runFfmpeg(
    [{ name: 'in.webm', data: new Uint8Array(await recorded.arrayBuffer()) }],
    ['-i', 'in.webm', '-r', String(opts.fps), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'out.mp4'],
    'out.mp4',
    length,
    (p) => onProgress({ ratio: 0.5 + p.ratio * 0.5, stage: p.stage }),
    signal,
    'Mengonversi WebM → MP4 (ffmpeg.wasm)…',
  );
  return { blob: new Blob([out as BlobPart], { type: 'video/mp4' }), method: 'recorder' };
}
