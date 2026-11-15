import { blurredImage, drawCover, makeCanvas, type ImageSrc } from './blur';
import {
  drawAirplay,
  drawPause,
  drawPlay,
  drawSkip,
  drawSpeaker,
  makePlaceholderCover,
  roundRectPath,
} from './icons';

/**
 * PlayerRenderer — satu-satunya tempat tampilan "Now Playing" digambar.
 * Dipakai oleh pratinjau (PlayerPreview) DAN oleh ekspor video, sehingga
 * frame video selalu sama persis dengan pratinjau.
 *
 * Semua koordinat memakai ruang desain 1080×1920 lalu diskalakan ke ukuran
 * kanvas tujuan (mis. 720×1280).
 */

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;
export const EQ_BARS = 5;

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter Variable", "Inter", system-ui, sans-serif';

export const LAYOUT = {
  card: { x: 70, y: 153, w: 940, h: 1614, r: 100 },
  cover: { x: 126, y: 209, size: 828, r: 44 },
  text: { x: 126, titleY: 1117, artistY: 1179 },
  eq: { right: 954, cy: 1128, barW: 10, gap: 8, maxH: 68, minH: 10 },
  progress: { x: 126, w: 828, cy: 1245, h: 12, timeY: 1304 },
  controls: { cx: 540, cy: 1425, spacing: 270, playSize: 108, skipSize: 128 },
  volume: { x: 200, w: 660, cy: 1565, h: 12, iconL: 126, iconR: 954 },
  pill: { cx: 540, cy: 1675, h: 76 },
} as const;

/** Hal-hal yang jarang berubah (di-cache sebagai satu lapisan statis). */
export interface Scene {
  title: string;
  artist: string;
  cover: ImageSrc | null;
  /** null = pakai cover sebagai wallpaper */
  wallpaper: ImageSrc | null;
  /** intensitas blur dalam px pada ruang desain 1080×1920 */
  blur: number;
  /** 0..1 — seberapa gelap wallpaper */
  darkness: number;
}

/** Hal-hal yang berubah tiap frame. */
export interface Frame {
  currentTime: number;
  duration: number;
  playing: boolean;
  volume: number;
  /** tinggi bar equalizer, 0..1, panjang EQ_BARS */
  levels: ArrayLike<number>;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}

export class PlayerRenderer {
  private staticLayer: HTMLCanvasElement | null = null;
  private staticKey: unknown[] = [];
  private placeholder: HTMLCanvasElement | null = null;
  private version = 0;

  /** Buang cache (mis. setelah web font selesai dimuat). */
  invalidate(): void {
    this.version++;
  }

  private getPlaceholder(): HTMLCanvasElement {
    return (this.placeholder ??= makePlaceholderCover());
  }

  private buildStatic(w: number, h: number, scene: Scene): HTMLCanvasElement {
    const layer = makeCanvas(w, h);
    const ctx = layer.getContext('2d')!;
    const s = w / DESIGN_W;
    const cover = scene.cover ?? this.getPlaceholder();
    const wall = scene.wallpaper ?? cover;
    const L = LAYOUT;

    // 1. Latar: wallpaper di-blur + digelapkan
    ctx.imageSmoothingQuality = 'high';
    const bg = blurredImage(wall, w, h, scene.blur * s);
    ctx.drawImage(bg, 0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, Math.max(0, scene.darkness))})`;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(s, s);

    // 2. Kartu kaca: backdrop blur (wallpaper di-blur lebih kuat) + tint abu
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 24;
    roundRectPath(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.r);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.r);
    ctx.clip();
    const glass = blurredImage(wall, w, h, Math.max(scene.blur, 40) * s + 30 * s);
    ctx.drawImage(glass, 0, 0, DESIGN_W, DESIGN_H);
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, scene.darkness) * 0.45})`;
    ctx.fillRect(L.card.x, L.card.y, L.card.w, L.card.h);
    ctx.fillStyle = 'rgba(132,132,140,0.36)';
    ctx.fillRect(L.card.x, L.card.y, L.card.w, L.card.h);
    const sheen = ctx.createLinearGradient(0, L.card.y, 0, L.card.y + L.card.h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(L.card.x, L.card.y, L.card.w, L.card.h);
    ctx.restore();

    // border tipis putih transparan
    roundRectPath(ctx, L.card.x + 1, L.card.y + 1, L.card.w - 2, L.card.h - 2, L.card.r - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Cover art
    const cv = L.cover;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 18;
    roundRectPath(ctx, cv.x, cv.y, cv.size, cv.size, cv.r);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, cv.x, cv.y, cv.size, cv.size, cv.r);
    ctx.clip();
    drawCover(ctx, cover, cv.x, cv.y, cv.size, cv.size);
    ctx.restore();
    roundRectPath(ctx, cv.x + 0.5, cv.y + 0.5, cv.size - 1, cv.size - 1, cv.r);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Judul + artis
    const eqW = EQ_BARS * L.eq.barW + (EQ_BARS - 1) * L.eq.gap;
    const textMax = L.eq.right - eqW - 36 - L.text.x;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = font(600, 54);
    ctx.fillText(ellipsize(ctx, scene.title || 'Tanpa Judul', textMax), L.text.x, L.text.titleY);
    ctx.fillStyle = 'rgba(235,235,245,0.62)';
    ctx.font = font(400, 46);
    ctx.fillText(ellipsize(ctx, scene.artist || 'Artis tidak dikenal', textMax), L.text.x, L.text.artistY);

    // 6. Tombol prev / next
    ctx.fillStyle = '#fff';
    const ct = L.controls;
    drawSkip(ctx, ct.cx - ct.spacing, ct.cy, ct.skipSize, -1);
    drawSkip(ctx, ct.cx + ct.spacing, ct.cy, ct.skipSize, 1);

    // 7. Ikon speaker volume
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    drawSpeaker(ctx, L.volume.iconL, L.volume.cy, 44, 0);
    drawSpeaker(ctx, L.volume.iconR - 60, L.volume.cy, 44, 3);

    // 8. Pill AirPlay "iPhone"
    ctx.font = font(500, 34);
    const label = 'iPhone';
    const tw = ctx.measureText(label).width;
    const icon = 40;
    const pillW = 34 + icon + 14 + tw + 38;
    const px = L.pill.cx - pillW / 2;
    roundRectPath(ctx, px, L.pill.cy - L.pill.h / 2, pillW, L.pill.h, L.pill.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    drawAirplay(ctx, px + 34 + icon / 2, L.pill.cy - 3, icon);
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + 34 + icon + 14, L.pill.cy + 2);

    ctx.restore();
    return layer;
  }

  /** Gambar satu frame penuh ke `ctx` berukuran width×height (rasio 9:16). */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, frame: Frame): void {
    const key = [
      width,
      height,
      scene.title,
      scene.artist,
      scene.cover,
      scene.wallpaper,
      scene.blur,
      scene.darkness,
      this.version,
    ];
    if (!this.staticLayer || key.some((v, i) => v !== this.staticKey[i])) {
      this.staticLayer = this.buildStatic(width, height, scene);
      this.staticKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.staticLayer, 0, 0);

    const s = width / DESIGN_W;
    ctx.save();
    ctx.scale(s, s);
    const L = LAYOUT;

    // 4b. Equalizer
    const eq = L.eq;
    const eqW = EQ_BARS * eq.barW + (EQ_BARS - 1) * eq.gap;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < EQ_BARS; i++) {
      const lv = Math.min(1, Math.max(0, frame.levels[i] ?? 0));
      const bh = eq.minH + lv * (eq.maxH - eq.minH);
      const bx = eq.right - eqW + i * (eq.barW + eq.gap);
      roundRectPath(ctx, bx, eq.cy - bh / 2, eq.barW, bh, eq.barW / 2);
      ctx.fill();
    }

    // 5. Progress bar + waktu
    const p = L.progress;
    const dur = frame.duration > 0 && Number.isFinite(frame.duration) ? frame.duration : 0;
    const cur = Math.min(dur, Math.max(0, frame.currentTime));
    const ratio = dur > 0 ? cur / dur : 0;
    roundRectPath(ctx, p.x, p.cy - p.h / 2, p.w, p.h, p.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fill();
    if (ratio > 0) {
      ctx.save();
      roundRectPath(ctx, p.x, p.cy - p.h / 2, p.w, p.h, p.h / 2);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x, p.cy - p.h / 2, p.w * ratio, p.h);
      ctx.restore();
    }
    ctx.font = font(500, 30);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(235,235,245,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText(formatTime(cur), p.x, p.timeY);
    ctx.textAlign = 'right';
    ctx.fillText('-' + formatTime(Math.ceil(dur - cur - 1e-6)), p.x + p.w, p.timeY);

    // 6b. Play / pause
    ctx.fillStyle = '#fff';
    const ct = L.controls;
    if (frame.playing) drawPause(ctx, ct.cx, ct.cy, ct.playSize);
    else drawPlay(ctx, ct.cx, ct.cy, ct.playSize);

    // 7b. Slider volume
    const v = L.volume;
    const vol = Math.min(1, Math.max(0, frame.volume));
    roundRectPath(ctx, v.x, v.cy - v.h / 2, v.w, v.h, v.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fill();
    if (vol > 0) {
      ctx.save();
      roundRectPath(ctx, v.x, v.cy - v.h / 2, v.w, v.h, v.h / 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(v.x, v.cy - v.h / 2, v.w * vol, v.h);
      ctx.restore();
    }

    ctx.restore();
  }
}
