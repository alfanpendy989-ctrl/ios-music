import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { DESIGN_H, DESIGN_W, LAYOUT, PlayerRenderer, formatTime, type Frame, type Scene } from '../renderer/PlayerRenderer';

interface Props {
  renderer: PlayerRenderer;
  scene: Scene;
  /** Dipanggil tiap frame animasi untuk mengambil keadaan terkini. */
  getFrame: (dt: number) => Frame;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolume: (v: number) => void;
  className?: string;
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

function box(x: number, y: number, w: number, h: number): CSSProperties {
  return {
    position: 'absolute',
    left: pct(x, DESIGN_W),
    top: pct(y, DESIGN_H),
    width: pct(w, DESIGN_W),
    height: pct(h, DESIGN_H),
  };
}

/**
 * Pratinjau interaktif: kanvas digambar oleh PlayerRenderer (sama dengan
 * ekspor), dengan kontrol transparan di atasnya untuk klik/seret/keyboard.
 */
export function PlayerPreview(props: Props) {
  const { renderer, className } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const frameRef = useRef<Frame | null>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let sig = '';

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = Math.min(DESIGN_W, Math.max(180, Math.round((wrap.clientWidth * dpr) / 2) * 2));
      const h = Math.round((w * DESIGN_H) / DESIGN_W);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        sig = '';
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { scene, getFrame } = latest.current;
      const frame = getFrame(dt);
      frameRef.current = frame;
      // perbarui nilai ARIA slider tanpa me-render ulang React
      const aria = `${Math.floor(frame.currentTime)}/${Math.floor(frame.duration)}/${Math.round(frame.volume * 100)}`;
      if (aria !== ariaSig) {
        ariaSig = aria;
        const sk = seekRef.current;
        if (sk) {
          sk.setAttribute('aria-valuemax', String(Math.floor(frame.duration)));
          sk.setAttribute('aria-valuenow', String(Math.floor(frame.currentTime)));
          sk.setAttribute('aria-valuetext', `${formatTime(frame.currentTime)} dari ${formatTime(frame.duration)}`);
        }
        volRef.current?.setAttribute('aria-valuenow', String(Math.round(frame.volume * 100)));
      }
      // Lewati penggambaran kalau tidak ada yang berubah.
      const next = [
        canvas.width,
        scene.title,
        scene.artist,
        scene.blur,
        scene.darkness,
        frame.currentTime.toFixed(2),
        frame.duration.toFixed(2),
        frame.playing,
        frame.volume.toFixed(3),
        Array.from(frame.levels, (l) => l.toFixed(3)).join(),
      ].join('|');
      if (next === sig && sceneRef === scene) return;
      sig = next;
      sceneRef = scene;
      renderer.render(ctx, canvas.width, canvas.height, scene, frame);
    };
    let sceneRef: Scene | null = null;
    let ariaSig = '';
    raf = requestAnimationFrame(tick);
    document.fonts?.ready.then(() => {
      renderer.invalidate();
      sig = '';
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [renderer]);

  const drag = (kind: 'seek' | 'volume') => (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const wrap = wrapRef.current!.getBoundingClientRect();
    const x = ((e.clientX - wrap.left) / wrap.width) * DESIGN_W;
    const track = kind === 'seek' ? LAYOUT.progress : LAYOUT.volume;
    const ratio = Math.min(1, Math.max(0, (x - track.x) / track.w));
    if (kind === 'seek') latest.current.onSeek(ratio * (frameRef.current?.duration ?? 0));
    else latest.current.onVolume(ratio);
  };

  const keys = (kind: 'seek' | 'volume') => (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const f = frameRef.current;
    if (!f) return;
    if (kind === 'seek') latest.current.onSeek(Math.min(f.duration, Math.max(0, f.currentTime + dir * 5)));
    else latest.current.onVolume(Math.min(1, Math.max(0, f.volume + dir * 0.05)));
  };

  const L = LAYOUT;
  const btn =
    'rounded-full outline-none transition-[background-color,transform] duration-150 hover:bg-white/10 active:scale-90 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 cursor-pointer';
  const hit = 190;

  return (
    <div
      ref={wrapRef}
      className={`relative aspect-[9/16] overflow-hidden rounded-[28px] bg-neutral-900 shadow-2xl shadow-black/60 ring-1 ring-white/10 select-none ${className ?? ''}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" data-testid="player-canvas" />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Posisi lagu"
        aria-valuemin={0}
        aria-valuemax={0}
        aria-valuenow={0}
        ref={seekRef}
        data-testid="seek"
        className="cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full"
        style={box(L.progress.x - 20, L.progress.cy - 36, L.progress.w + 40, 72)}
        onPointerDown={drag('seek')}
        onPointerMove={drag('seek')}
        onKeyDown={keys('seek')}
      />
      <button type="button" aria-label="Sebelumnya" data-testid="prev" className={btn} onClick={props.onPrev}
        style={box(L.controls.cx - L.controls.spacing - hit / 2, L.controls.cy - hit / 2, hit, hit)} />
      <button type="button" aria-label="Putar / jeda" data-testid="toggle" className={btn} onClick={props.onToggle}
        style={box(L.controls.cx - hit / 2, L.controls.cy - hit / 2, hit, hit)} />
      <button type="button" aria-label="Berikutnya" data-testid="next" className={btn} onClick={props.onNext}
        style={box(L.controls.cx + L.controls.spacing - hit / 2, L.controls.cy - hit / 2, hit, hit)} />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
        ref={volRef}
        data-testid="volume"
        className="cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full"
        style={box(L.volume.x - 20, L.volume.cy - 36, L.volume.w + 40, 72)}
        onPointerDown={drag('volume')}
        onPointerMove={drag('volume')}
        onKeyDown={keys('volume')}
      />
    </div>
  );
}
