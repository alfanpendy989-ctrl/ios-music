export interface Img {
  bitmap: ImageBitmap;
  /** object URL untuk thumbnail di UI */
  url: string;
}

const MAX_EDGE = 2048;

/** Decode gambar menjadi ImageBitmap (diperkecil bila terlalu besar). */
export async function loadImage(blob: Blob): Promise<Img> {
  let bitmap = await createImageBitmap(blob);
  const edge = Math.max(bitmap.width, bitmap.height);
  if (edge > MAX_EDGE) {
    const k = MAX_EDGE / edge;
    const small = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * k),
      resizeHeight: Math.round(bitmap.height * k),
      resizeQuality: 'high',
    });
    bitmap.close();
    bitmap = small;
  }
  return { bitmap, url: URL.createObjectURL(blob) };
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
