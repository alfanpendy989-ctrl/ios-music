import { BandMeter, FFT_SIZE } from './spectrum';

/**
 * Pemutar audio: <audio> → MediaElementSource → AnalyserNode (equalizer)
 *                                             → GainNode (volume) → speaker
 */
export class AudioEngine {
  readonly audio = new Audio();
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private bytes = new Uint8Array(FFT_SIZE / 2);
  private meter = new BandMeter();
  private volume = 1;

  constructor() {
    this.audio.preload = 'auto';
  }

  /** AudioContext baru boleh dibuat setelah ada gestur pengguna. */
  private ensureGraph(): void {
    if (this.ctx) return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // tanpa Web Audio: tetap bisa memutar, tanpa equalizer
    try {
      const ctx = new Ctor();
      const source = ctx.createMediaElementSource(this.audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -30;
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      source.connect(analyser);
      source.connect(gain);
      gain.connect(ctx.destination);
      this.audio.volume = 1;
      this.ctx = ctx;
      this.analyser = analyser;
      this.gain = gain;
    } catch {
      this.ctx = null;
    }
  }

  load(url: string): void {
    this.audio.src = url;
    this.audio.load();
  }

  unload(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  async play(): Promise<void> {
    this.ensureGraph();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  seek(time: number): void {
    const d = this.duration;
    if (d > 0) this.audio.currentTime = Math.min(Math.max(0, time), Math.max(0, d - 0.05));
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.gain) this.gain.gain.value = this.volume;
    else this.audio.volume = this.volume;
  }

  get currentTime(): number {
    return this.audio.currentTime || 0;
  }

  get duration(): number {
    const d = this.audio.duration;
    return Number.isFinite(d) ? d : 0;
  }

  get playing(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  /** Tinggi bar equalizer saat ini (sudah dihaluskan). */
  levels(dt: number): Float32Array {
    if (this.analyser && this.ctx && this.playing) {
      this.analyser.getByteFrequencyData(this.bytes);
      return this.meter.step(this.bytes, this.ctx.sampleRate, dt);
    }
    return this.meter.decay(dt);
  }
}
