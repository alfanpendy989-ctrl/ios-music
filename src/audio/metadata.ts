import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export interface Metadata {
  title?: string;
  artist?: string;
  picture?: Blob;
}

/** Baca judul, artis, dan cover bawaan (ID3 / MP4 / FLAC) lewat jsmediatags. */
export function readMetadata(file: File): Promise<Metadata> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: ({ tags }) => {
          const meta: Metadata = {
            title: tags.title?.trim() || undefined,
            artist: tags.artist?.trim() || undefined,
          };
          const pic = tags.picture;
          if (pic?.data?.length) {
            try {
              meta.picture = new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' });
            } catch {
              /* abaikan cover rusak */
            }
          }
          resolve(meta);
        },
        onError: () => resolve({}), // tidak ada tag → pakai nama file
      });
    } catch {
      resolve({});
    }
  });
}

/** Tebak judul/artis dari nama file "Artis - Judul.mp3". */
export function guessFromFilename(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base || 'Tanpa Judul', artist: '' };
}

/** Cek apakah browser bisa memutar file ini, sekaligus ambil durasinya. */
export function probeAudio(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'metadata';
    const done = (fn: () => void) => {
      clearTimeout(timer);
      a.onloadedmetadata = a.onerror = null;
      a.removeAttribute('src');
      a.load();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), 15000);
    a.onloadedmetadata = () => {
      const d = a.duration;
      done(() => (Number.isFinite(d) && d > 0 ? resolve(d) : reject(new Error('durasi tidak valid'))));
    };
    a.onerror = () => done(() => reject(new Error('format tidak didukung')));
    a.src = url;
  });
}
