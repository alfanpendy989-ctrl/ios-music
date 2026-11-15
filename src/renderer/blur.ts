export type ImageSrc = ImageBitmap | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Gambar `src` memenuhi kotak tujuan (seperti CSS object-fit: cover). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  src: ImageSrc,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const sw = src.width;
  const sh = src.height;
  if (!sw || !sh) return;
  const scale = Math.max(dw / sw, dh / sh);
  const cw = dw / scale;
  const ch = dh / scale;
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, dx, dy, dw, dh);
}

/** Satu lintasan box blur sepanjang satu sumbu, tepi di-clamp. */
function boxPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  lines: number,
  len: number,
  lineStride: number,
  pxStride: number,
  r: number,
): void {
  const win = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const i = Math.min(len - 1, Math.max(0, k));
        sum += src[base + i * pxStride + c];
      }
      for (let i = 0; i < len; i++) {
        dst[base + i * pxStride + c] = sum / win;
        const add = Math.min(len - 1, i + r + 1);
        const sub = Math.max(0, i - r);
        sum += src[base + add * pxStride + c] - src[base + sub * pxStride + c];
      }
    }
    for (let i = 0; i < len; i++) dst[base + i * pxStride + 3] = 255;
  }
}

/**
 * Menghasilkan kanvas kecil berisi gambar yang sudah di-blur (setara
 * gaussian blur `blurPx` pada ukuran keluaran outW×outH). Blur dihitung
 * sendiri di JS (downscale + 3× box blur) supaya hasilnya identik di semua
 * browser — `ctx.filter` tidak tersedia di semua Safari.
 * Kanvas hasil tinggal digambar membentang ke ukuran keluaran.
 */
export function blurredImage(src: ImageSrc, outW: number, outH: number, blurPx: number): HTMLCanvasElement {
  if (blurPx <= 0.5) {
    const c = makeCanvas(outW, outH);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, src, 0, 0, c.width, c.height);
    return c;
  }
  const factor = Math.max(2, blurPx / 5);
  const w = Math.max(4, Math.round(outW / factor));
  const h = Math.max(4, Math.round(outH / factor));
  const sigma = blurPx / factor;
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));

  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  // Perkecil bertahap agar tidak aliasing saat sumbernya jauh lebih besar.
  let cur: ImageSrc = src;
  while (cur.width > w * 4 && cur.height > h * 4) {
    const half = makeCanvas(cur.width / 2, cur.height / 2);
    const hctx = half.getContext('2d')!;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  drawCover(ctx, cur, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const a = img.data;
  const b = new Uint8ClampedArray(a.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, h, w, w * 4, 4, r); // horizontal
    boxPass(b, a, w, h, 4, w * 4, r); // vertikal
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
