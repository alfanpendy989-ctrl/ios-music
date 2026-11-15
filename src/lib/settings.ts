export interface Settings {
  blur: number;
  darkness: number;
  wallpaperMode: 'cover' | 'custom';
  volume: number;
  resolution: 720 | 1080;
  rangeMode: 'full' | 'clip';
}

export const DEFAULT_SETTINGS: Settings = {
  blur: 60,
  darkness: 0.3,
  wallpaperMode: 'cover',
  volume: 0.8,
  resolution: 1080,
  rangeMode: 'full',
};

const KEY = 'ios-music-player:settings:v1';
const WALLPAPER_KEY = 'ios-music-player:wallpaper:v1';

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    return {
      blur: num(raw.blur, 0, 120, DEFAULT_SETTINGS.blur),
      darkness: num(raw.darkness, 0, 0.9, DEFAULT_SETTINGS.darkness),
      wallpaperMode: raw.wallpaperMode === 'custom' ? 'custom' : 'cover',
      volume: num(raw.volume, 0, 1, DEFAULT_SETTINGS.volume),
      resolution: raw.resolution === 720 ? 720 : 1080,
      rangeMode: raw.rangeMode === 'clip' ? 'clip' : 'full',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* penyimpanan penuh / diblokir — abaikan */
  }
}

export function loadWallpaperDataUrl(): string | null {
  try {
    return localStorage.getItem(WALLPAPER_KEY);
  } catch {
    return null;
  }
}

export function saveWallpaperDataUrl(dataUrl: string | null): void {
  try {
    if (dataUrl) localStorage.setItem(WALLPAPER_KEY, dataUrl);
    else localStorage.removeItem(WALLPAPER_KEY);
  } catch {
    /* kuota terlampaui — wallpaper tidak disimpan */
  }
}
