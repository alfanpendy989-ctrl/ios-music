import { BandMeter, OfflineAnalyser } from '../audio/spectrum';
import type { Frame } from '../renderer/PlayerRenderer';
import type { ExportOptions } from './types';

/**
 * Pembuat Frame deterministik untuk ekspor: waktu + level equalizer dihitung
 * dari audio yang sudah di-decode (bukan dari pemutaran realtime).
 */
export class FrameSource {
  private analyser: OfflineAnalyser;
  private meter = new BandMeter();
  private lastT: number;

  constructor(private opts: ExportOptions) {
    this.analyser = new OfflineAnalyser(opts.buffer);
    // pemanasan beberapa detik supaya bar & auto-gain sudah stabil di awal potongan
    const dt = 1 / opts.fps;
    this.lastT = Math.max(0, opts.start - 3);
    for (let t = this.lastT; t < opts.start - dt / 2; t += dt) this.frameAt(t);
  }

  frameAt(t: number): Frame {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    return {
      currentTime: t,
      duration: this.opts.duration,
      playing: true,
      volume: this.opts.volume,
      levels: this.meter.step(this.analyser.spectrumAt(t), this.analyser.sampleRate, dt),
    };
  }
}

/** Potong PCM stereo (planar) untuk rentang ekspor. */
export function slicePcm(buffer: AudioBuffer, start: number, end: number): [Float32Array, Float32Array] {
  const s = Math.max(0, Math.floor(start * buffer.sampleRate));
  const e = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
  const left = buffer.getChannelData(0).subarray(s, e);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).subarray(s, e) : left;
  return [left, right];
}

/** Bungkus PCM menjadi file WAV 16-bit (untuk ffmpeg.wasm). */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const n = left.length;
  const out = new Uint8Array(44 + n * 4);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    v.setInt16(o, Math.max(-1, Math.min(1, left[i])) * 0x7fff, true);
    v.setInt16(o + 2, Math.max(-1, Math.min(1, right[i])) * 0x7fff, true);
  }
  return out;
}
