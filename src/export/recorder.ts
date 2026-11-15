import { FrameSource } from './frames';
import { ExportError, abortError, type ExportOptions, type ProgressFn } from './types';

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function recorderSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    MIME_CANDIDATES.some((m) => MediaRecorder.isTypeSupported(m))
  );
}

/**
 * Jalur cadangan untuk browser tanpa WebCodecs: gambar kanvas secara
 * realtime sambil memutar audio hasil decode ke MediaStream, lalu rekam
 * dengan MediaRecorder. Hasilnya WebM (atau MP4 di Safari/Chrome baru).
 */
export async function recordRealtime(
  opts: ExportOptions,
  onProgress: ProgressFn,
  signal: AbortSignal,
): Promise<Blob> {
  const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new ExportError('MediaRecorder tidak mendukung format video apa pun di browser ini.');
  const { width, height, fps, start, end, buffer } = opts;
  const length = end - start;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const frames = new FrameSource(opts);
  opts.renderer.render(ctx, width, height, opts.scene, frames.frameAt(start));

  const actx = new AudioContext();
  const dest = actx.createMediaStreamDestination();
  const source = actx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);
  const videoStream = canvas.captureStream(fps);
  const stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: width >= 1080 ? 8_000_000 : 5_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  let timer = 0;
  const cleanup = () => {
    clearInterval(timer);
    try {
      source.stop();
    } catch {
      /* belum mulai */
    }
    stream.getTracks().forEach((t) => t.stop());
    void actx.close();
  };

  try {
    await actx.resume();
    return await new Promise<Blob>((resolve, reject) => {
      const onAbort = () => {
        if (recorder.state !== 'inactive') recorder.stop();
        reject(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      recorder.onerror = () => reject(new ExportError('Perekaman gagal.'));
      recorder.onstop = () => {
        signal.removeEventListener('abort', onAbort);
        if (!signal.aborted) resolve(new Blob(chunks, { type: mime.split(';')[0] }));
      };
      recorder.start(1000);
      const t0 = actx.currentTime + 0.05;
      source.start(t0, start, length);
      timer = window.setInterval(() => {
        const elapsed = actx.currentTime - t0;
        if (elapsed >= length) {
          clearInterval(timer);
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        const t = start + Math.max(0, elapsed);
        opts.renderer.render(ctx, width, height, opts.scene, frames.frameAt(t));
        onProgress({ ratio: Math.max(0, elapsed) / length, stage: 'Merekam secara realtime…' });
      }, 1000 / fps);
    });
  } finally {
    cleanup();
  }
}
