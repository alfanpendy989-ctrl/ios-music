import { EQ_BARS } from '../renderer/PlayerRenderer';

export const FFT_SIZE = 2048;
const MIN_DB = -100;
const MAX_DB = -30;

/** Rentang frekuensi (Hz) tiap bar equalizer. */
const BANDS: [number, number][] = [
  [40, 180],
  [180, 600],
  [600, 1800],
  [1800, 5000],
  [5000, 12000],
];
const PEAK_MIN = 0.3;
/** penurunan puncak per detik */
const PEAK_DECAY = 0.06;
/** rentang dinamis di bawah puncak yang dipetakan ke 0..1 */
const RANGE = 0.22;

/**
 * Mengubah spektrum byte (format AnalyserNode.getByteFrequencyData) menjadi
 * tinggi bar 0..1. Dipakai untuk pratinjau (AnalyserNode) dan ekspor (FFT
 * offline) sehingga animasinya sama.
 *
 * Tiap band dinormalkan terhadap puncak terbarunya (auto-gain), jadi bar
 * tetap hidup baik untuk lagu yang pelan maupun yang keras; lalu dihaluskan
 * terhadap waktu (naik cepat, turun pelan) tanpa bergantung frame rate.
 */
export class BandMeter {
  readonly levels = new Float32Array(EQ_BARS);
  private peak = new Float32Array(EQ_BARS).fill(PEAK_MIN);

  step(bytes: Uint8Array, sampleRate: number, dt: number): Float32Array {
    const hzPerBin = sampleRate / FFT_SIZE;
    for (let b = 0; b < EQ_BARS; b++) {
      const lo = Math.max(1, Math.floor(BANDS[b][0] / hzPerBin));
      const hi = Math.min(bytes.length - 1, Math.max(lo, Math.ceil(BANDS[b][1] / hzPerBin)));
      let sum = 0;
      let max = 0;
      for (let i = lo; i <= hi; i++) {
        sum += bytes[i];
        if (bytes[i] > max) max = bytes[i];
      }
      const v = (0.5 * (sum / (hi - lo + 1)) + 0.5 * max) / 255;
      this.peak[b] = Math.max(PEAK_MIN, v, this.peak[b] - PEAK_DECAY * dt);
      const n = Math.min(1, Math.max(0, (v - (this.peak[b] - RANGE)) / RANGE));
      this.smooth(b, Math.pow(n, 1.6), dt);
    }
    return this.levels;
  }

  /** Tidak ada audio (jeda): bar turun perlahan ke nol. */
  decay(dt: number): Float32Array {
    for (let b = 0; b < EQ_BARS; b++) this.smooth(b, 0, dt);
    return this.levels;
  }

  private smooth(b: number, target: number, dt: number): void {
    const tau = target > this.levels[b] ? 0.03 : 0.13;
    this.levels[b] += (target - this.levels[b]) * (1 - Math.exp(-dt / tau));
    if (this.levels[b] < 0.001) this.levels[b] = 0;
  }
}

class FFT {
  private rev: Uint32Array;
  private cos: Float32Array;
  private sin: Float32Array;

  constructor(readonly n: number) {
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
  }

  /** FFT in-place; `re` sudah harus dalam urutan bit-reversed. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.n;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k];
          const wi = -this.sin[k];
          const xr = re[i + j + half] * wr - im[i + j + half] * wi;
          const xi = re[i + j + half] * wi + im[i + j + half] * wr;
          re[i + j + half] = re[i + j] - xr;
          im[i + j + half] = im[i + j] - xi;
          re[i + j] += xr;
          im[i + j] += xi;
        }
      }
    }
  }

  get reverse(): Uint32Array {
    return this.rev;
  }
}

/**
 * Tiruan AnalyserNode untuk audio yang sudah di-decode: memberi spektrum
 * byte pada waktu `t` (jendela Blackman, FFT 2048, skala dB -100..-30).
 */
export class OfflineAnalyser {
  private fft = new FFT(FFT_SIZE);
  private window = new Float32Array(FFT_SIZE);
  private re = new Float32Array(FFT_SIZE);
  private im = new Float32Array(FFT_SIZE);
  private channels: Float32Array[] = [];
  readonly sampleRate: number;
  readonly bytes = new Uint8Array(FFT_SIZE / 2);

  constructor(buffer: AudioBuffer) {
    this.sampleRate = buffer.sampleRate;
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) this.channels.push(buffer.getChannelData(c));
    const a0 = 0.42;
    const a1 = 0.5;
    const a2 = 0.08;
    for (let i = 0; i < FFT_SIZE; i++) {
      const x = (2 * Math.PI * i) / FFT_SIZE;
      this.window[i] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x);
    }
  }

  /** Spektrum dari 2048 sampel terakhir sebelum waktu `t` (detik). */
  spectrumAt(t: number): Uint8Array {
    const end = Math.round(t * this.sampleRate);
    const start = end - FFT_SIZE;
    const { re, im, channels } = this;
    const rev = this.fft.reverse;
    const len = channels[0].length;
    const gain = 1 / channels.length;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      let v = 0;
      if (idx >= 0 && idx < len) for (const ch of channels) v += ch[idx];
      re[rev[i]] = v * gain * this.window[i];
      im[rev[i]] = 0;
    }
    this.fft.transform(re, im);
    const scale = 255 / (MAX_DB - MIN_DB);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      const mag = Math.hypot(re[i], im[i]) / FFT_SIZE;
      const db = mag > 0 ? 20 * Math.log10(mag) : -Infinity;
      this.bytes[i] = Math.min(255, Math.max(0, (db - MIN_DB) * scale));
    }
    return this.bytes;
  }
}
