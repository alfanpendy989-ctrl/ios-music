import type { Img } from './lib/images';

export interface Track {
  id: string;
  file: File;
  url: string;
  title: string;
  artist: string;
  duration: number;
  /** cover yang sedang dipakai */
  cover: Img | null;
  /** cover bawaan dari metadata (untuk tombol "kembalikan") */
  embeddedCover: Img | null;
}

export type TabId = 'song' | 'cover' | 'wallpaper' | 'export';

export interface Toast {
  id: number;
  kind: 'error' | 'info' | 'success';
  text: string;
}

export interface ExportState {
  status: 'idle' | 'running' | 'done' | 'error';
  ratio: number;
  stage: string;
  message?: string;
}
