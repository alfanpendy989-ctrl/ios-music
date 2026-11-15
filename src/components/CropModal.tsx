import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Slider } from './ui';

interface Props {
  file: Blob;
  onDone: (cropped: Blob) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

const OUT = 1200;

/** Dialog crop persegi: geser untuk memposisikan, slider/scroll untuk zoom. */
export function CropModal({ file, onDone, onCancel, onError }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [view, setView] = useState(320);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const fit = () => setView(Math.max(200, Math.min(360, window.innerWidth - 72, window.innerHeight - 320)));
    fit();
    window.addEventListener('resize', fit);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', esc);
    };
  }, [onCancel]);

  const scale = size ? (view / Math.min(size.w, size.h)) * zoom : 1;
  const clamp = (o: { x: number; y: number }, sc = scale) => {
    if (!size) return o;
    const mx = Math.max(0, (size.w * sc - view) / 2);
    const my = Math.max(0, (size.h * sc - view) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const applyZoom = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    if (size) setOff((o) => clamp({ x: (o.x * nz) / zoom, y: (o.y * nz) / zoom }, (view / Math.min(size.w, size.h)) * nz));
    setZoom(nz);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !size) return;
    const sw = view / scale;
    const sx = size.w / 2 - off.x / scale - sw / 2;
    const sy = size.h / 2 - off.y / scale - sw / 2;
    const out = Math.round(Math.min(OUT, Math.max(256, sw)));
    const c = document.createElement('canvas');
    c.width = c.height = out;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, out, out);
    c.toBlob((b) => (b ? onDone(b) : onError('Gagal memotong gambar.')), 'image/jpeg', 0.92);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Potong cover"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-[420px] rounded-3xl border border-white/10 bg-neutral-900 p-5 shadow-2xl">
        <h2 className="text-lg font-semibold">Potong cover</h2>
        <p className="mt-0.5 text-sm text-white/50">Geser gambar untuk mengatur posisi.</p>
        <div
          className="relative mx-auto mt-4 cursor-grab touch-none overflow-hidden rounded-2xl bg-black active:cursor-grabbing"
          style={{ width: view, height: view }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
          onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          data-testid="crop-area"
        >
          {url && (
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => onError('Gambar tidak bisa dibuka: format tidak didukung.')}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
              style={
                size
                  ? {
                      width: size.w * scale,
                      height: size.h * scale,
                      transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))`,
                    }
                  : { opacity: 0 }
              }
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/30 ring-inset" />
        </div>
        <div className="mt-4">
          <Slider label="Zoom" min={1} max={4} step={0.01} value={zoom} display={`${zoom.toFixed(1)}×`} onChange={applyZoom} />
        </div>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Batal
          </Button>
          <Button variant="primary" className="flex-1" disabled={!size} onClick={confirm}>
            Pakai cover
          </Button>
        </div>
      </div>
    </div>
  );
}
