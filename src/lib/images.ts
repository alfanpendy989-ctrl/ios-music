export interface Img {
  bitmap: ImageBitmap;
  /** object URL untuk thumbnail di UI */
  url: string;
}

const MAX_EDGE = 2048;

/** Decode gambar menjadi ImageBitmap (diperkecil bila terlalu besar). */
export async function loadImage(blob: Blob): Promise<Img> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // Browser lama gagal men-decode beberapa format lewat createImageBitmap:
    // coba lewat <img>, yang dukungan formatnya lebih luas.
    bitmap = await viaImageElement(blob);
  }
  const edge = Math.max(bitmap.width, bitmap.height);
  if (edge > MAX_EDGE) {
    const k = MAX_EDGE / edge;
    const w = Math.round(bitmap.width * k);
    const h = Math.round(bitmap.height * k);
    let small: ImageBitmap;
    try {
      small = await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      if (small.width !== w) throw new Error('opsi resize diabaikan');
    } catch {
      small = await createImageBitmap(scaleToCanvas(bitmap, w, h));
    }
    bitmap.close();
    bitmap = small;
  }
  return { bitmap, url: URL.createObjectURL(blob) };
}

function scaleToCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

function viaImageElement(blob: Blob): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      createImageBitmap(scaleToCanvas(img, w, h)).then(resolve, reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('gambar tidak bisa di-decode'));
    };
    img.src = url;
  });
}

export function disposeImage(img: Img | null | undefined): void {
  if (!img) return;
  URL.revokeObjectURL(img.url);
  img.bitmap.close();
}

/** JPEG data URL kecil untuk disimpan di localStorage. */
export function toDataUrl(img: Img, maxEdge = 900): string {
  const k = Math.min(1, maxEdge / Math.max(img.bitmap.width, img.bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.bitmap.width * k);
  c.height = Math.round(img.bitmap.height * k);
  c.getContext('2d')!.drawImage(img.bitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
