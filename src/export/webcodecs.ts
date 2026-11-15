import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { FrameSource, slicePcm } from './frames';
import { ExportError, abortError, throwIfAborted, yieldToLoop, type ExportOptions, type ProgressFn } from './types';

const AAC = 'mp4a.40.2';
const AUDIO_BITRATE = 192_000;

export interface WebCodecsSupport {
  video: VideoEncoderConfig;
  /** null = browser tidak punya encoder AAC (audio di-encode lewat ffmpeg.wasm) */
  audio: AudioEncoderConfig | null;
}

/** Cari konfigurasi H.264 (+ AAC) yang didukung browser ini. */
export async function detectWebCodecs(
  width: number,
  height: number,
  fps: number,
  sampleRate = 48000,
): Promise<WebCodecsSupport | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const bitrate = width >= 1080 ? 8_000_000 : 5_000_000;
  let video: VideoEncoderConfig | null = null;
  // High → Main → Baseline, level 4.0/4.2 (cukup untuk 1080×1920@30)
  for (const codec of ['avc1.640028', 'avc1.64002a', 'avc1.4d0028', 'avc1.4d002a', 'avc1.42002a', 'avc1.42e028']) {
    const cfg: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) {
        video = cfg;
        break;
      }
    } catch {
      /* coba profil berikutnya */
    }
  }
  if (!video) return null;

  let audio: AudioEncoderConfig | null = null;
  if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    const cfg: AudioEncoderConfig = { codec: AAC, sampleRate, numberOfChannels: 2, bitrate: AUDIO_BITRATE };
    try {
      if ((await AudioEncoder.isConfigSupported(cfg)).supported) audio = cfg;
    } catch {
      /* tanpa AAC */
    }
  }
  return { video, audio };
}

/**
 * Render offline frame demi frame → H.264 (WebCodecs) → MP4 (mp4-muxer).
 * Kalau `support.audio` null, hasilnya MP4 tanpa audio (audio ditambahkan
 * belakangan oleh ffmpeg.wasm).
 */
export async function encodeWithWebCodecs(
  opts: ExportOptions,
  support: WebCodecsSupport,
  onProgress: ProgressFn,
  signal: AbortSignal,
): Promise<Blob> {
  const { width, height, fps, start, end, buffer } = opts;
  const totalFrames = Math.max(1, Math.round((end - start) * fps));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: support.audio
      ? {
          codec: support.audio.codec.startsWith('mp4a') ? 'aac' : 'opus',
          numberOfChannels: 2, sampleRate: buffer.sampleRate,
        }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure: unknown = null;
  const fail = (e: unknown) => {
    failure ??= e;
  };
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: fail,
  });
  videoEncoder.configure(support.video);
  let audioEncoder: AudioEncoder | null = null;

  const check = () => {
    if (signal.aborted) throw abortError();
    if (failure) throw new ExportError(`Encoder gagal: ${failure instanceof Error ? failure.message : String(failure)}`);
  };

  try {
    // --- audio ---
    if (support.audio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: fail,
      });
      audioEncoder.configure(support.audio);
      const [left, right] = slicePcm(buffer, start, end);
      const sr = buffer.sampleRate;
      const block = sr; // 1 detik per AudioData
      for (let off = 0; off < left.length; off += block) {
        check();
        const n = Math.min(block, left.length - off);
        const data = new Float32Array(n * 2);
        data.set(left.subarray(off, off + n), 0);
        data.set(right.subarray(off, off + n), n);
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: sr,
          numberOfFrames: n,
          numberOfChannels: 2,
          timestamp: Math.round((off / sr) * 1e6),
          data,
        });
        audioEncoder.encode(ad);
        ad.close();
        if (audioEncoder.encodeQueueSize > 20) await yieldToLoop();
      }
    }

    // --- video ---
    const frames = new FrameSource(opts);
    const frameDur = 1e6 / fps;
    for (let i = 0; i < totalFrames; i++) {
      check();
      opts.renderer.render(ctx, width, height, opts.scene, frames.frameAt(start + i / fps));
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      videoEncoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      // backpressure: jangan menumpuk frame mentah di memori
      while (videoEncoder.encodeQueueSize > 6) {
        await yieldToLoop();
        check();
      }
      if (i % 3 === 0) {
        onProgress({ ratio: (i + 1) / totalFrames, stage: `Merender frame ${i + 1}/${totalFrames}` });
        await yieldToLoop();
      }
    }
    onProgress({ ratio: 1, stage: 'Menyelesaikan encoding…' });
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    check();
    muxer.finalize();
    throwIfAborted(signal);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
  }
}
