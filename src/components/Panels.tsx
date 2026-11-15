import { useEffect, useState } from 'react';
import { detectExportMethod } from '../export/exportVideo';
import type { ExportMethod } from '../export/types';
import type { Img } from '../lib/images';
import type { Settings } from '../lib/settings';
import { formatTime } from '../renderer/PlayerRenderer';
import type { ExportState, Track } from '../types';
import { Button, FilePicker, Section, Segmented, Slider, TextField, TimeField } from './ui';

export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.wav,.ogg,.oga,.aac,.flac,.opus';
export const IMAGE_ACCEPT = 'image/*';

/* ------------------------------- Lagu ---------------------------------- */

export function SongPanel(props: {
  tracks: Track[];
  current: Track | null;
  playing: boolean;
  loading: boolean;
  onAdd: (files: File[]) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, patch: Partial<Pick<Track, 'title' | 'artist'>>) => void;
}) {
  const { tracks, current } = props;
  return (
    <div className="space-y-7">
      <Section title="Unggah lagu" hint="MP3, M4A, WAV, atau OGG — bisa juga seret file ke halaman ini.">
        <FilePicker accept={AUDIO_ACCEPT} multiple variant="primary" className="w-full" onFiles={props.onAdd} disabled={props.loading}>
          {props.loading ? 'Memuat…' : '＋ Pilih file lagu'}
        </FilePicker>
      </Section>

      <Section title="Info lagu">
        <TextField
          label="Judul"
          value={current?.title ?? ''}
          disabled={!current}
          placeholder="Judul lagu"
          onChange={(v) => current && props.onEdit(current.id, { title: v })}
        />
        <TextField
          label="Artis"
          value={current?.artist ?? ''}
          disabled={!current}
          placeholder="Nama artis"
          onChange={(v) => current && props.onEdit(current.id, { artist: v })}
        />
      </Section>

      <Section title={`Playlist${tracks.length ? ` (${tracks.length})` : ''}`}>
        {tracks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/45">
            Belum ada lagu. Unggah lagu untuk mulai.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="playlist">
            {tracks.map((t) => {
              const active = t.id === current?.id;
              return (
                <li
                  key={t.id}
                  className={`flex items-center gap-1 rounded-2xl pr-1 transition-colors duration-200 ${
                    active ? 'bg-white/[0.14]' : 'hover:bg-white/[0.07]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => props.onSelect(t.id)}
                    aria-current={active}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-rose-400 to-fuchsia-800">
                      {t.cover && <img src={t.cover.url} alt="" className="h-full w-full object-cover" />}
                      {active && props.playing && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs">♪</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{t.title || 'Tanpa Judul'}</span>
                      <span className="block truncate text-[13px] text-white/50">{t.artist || 'Artis tidak dikenal'}</span>
                    </span>
                    <span className="text-[13px] text-white/45 tabular-nums">{formatTime(t.duration)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus ${t.title}`}
                    onClick={() => props.onRemove(t.id)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------- Cover --------------------------------- */

export function CoverPanel(props: {
  current: Track | null;
  onPick: (file: File) => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  const { current } = props;
  const canRestore = !!current?.embeddedCover && current.cover !== current.embeddedCover;
  return (
    <div className="space-y-7">
      <Section title="Cover art" hint="Gambar dipotong persegi sebelum dipakai.">
        <div className="flex items-center gap-4">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-rose-400 via-red-500 to-fuchsia-800 ring-1 ring-white/10">
            {current?.cover && <img src={current.cover.url} alt="Cover saat ini" className="h-full w-full object-cover" />}
          </div>
          <div className="flex-1 space-y-2">
            <FilePicker accept={IMAGE_ACCEPT} variant="primary" className="w-full" disabled={!current} onFiles={(f) => props.onPick(f[0])}>
              Ganti cover
            </FilePicker>
            {canRestore && (
              <Button className="w-full" onClick={props.onRestore}>
                Pakai cover bawaan
              </Button>
            )}
            {current?.cover && (
              <Button variant="ghost" className="w-full" onClick={props.onClear}>
                Hapus cover
              </Button>
            )}
          </div>
        </div>
        {!current && <p className="text-sm text-white/45">Unggah lagu dulu untuk mengganti cover.</p>}
      </Section>
    </div>
  );
}

/* ----------------------------- Wallpaper ------------------------------- */

export function WallpaperPanel(props: {
  settings: Settings;
  wallpaper: Img | null;
  onSettings: (patch: Partial<Settings>) => void;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const { settings, wallpaper } = props;
  return (
    <div className="space-y-7">
      <Section title="Sumber wallpaper">
        <Segmented
          label="Sumber wallpaper"
          value={settings.wallpaperMode}
          onChange={(v) => props.onSettings({ wallpaperMode: v })}
          options={[
            { value: 'cover', label: 'Cover (blur)' },
            { value: 'custom', label: 'Gambar sendiri' },
          ]}
        />
        {settings.wallpaperMode === 'custom' && (
          <div className="flex items-center gap-4">
            <div className="aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.07] ring-1 ring-white/10">
              {wallpaper && <img src={wallpaper.url} alt="Wallpaper saat ini" className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1 space-y-2">
              <FilePicker accept={IMAGE_ACCEPT} variant="primary" className="w-full" onFiles={(f) => props.onPick(f[0])}>
                {wallpaper ? 'Ganti gambar' : 'Unggah gambar'}
              </FilePicker>
              {wallpaper && (
                <Button variant="ghost" className="w-full" onClick={props.onRemove}>
                  Hapus gambar
                </Button>
              )}
              {!wallpaper && <p className="text-xs text-white/45">Selama belum ada gambar, cover dipakai sebagai wallpaper.</p>}
            </div>
          </div>
        )}
      </Section>

      <Section title="Tampilan">
        <Slider
          label="Intensitas blur"
          min={0}
          max={120}
          value={settings.blur}
          display={`${Math.round(settings.blur)} px`}
          onChange={(v) => props.onSettings({ blur: v })}
        />
        <Slider
          label="Kegelapan"
          min={0}
          max={0.9}
          step={0.01}
          value={settings.darkness}
          display={`${Math.round(settings.darkness * 100)}%`}
          onChange={(v) => props.onSettings({ darkness: v })}
        />
        <Button variant="ghost" onClick={() => props.onSettings({ blur: 60, darkness: 0.3 })}>
          Kembalikan ke bawaan
        </Button>
      </Section>
    </div>
  );
}

/* ------------------------------- Ekspor -------------------------------- */

const METHOD_INFO: Record<ExportMethod, { text: string; warn: boolean }> = {
  webcodecs: { text: 'WebCodecs (H.264 + AAC), dirender offline frame demi frame.', warn: false },
  'webcodecs+ffmpeg': {
    text: 'Video dirender offline dengan WebCodecs (H.264). Browser ini tidak punya encoder AAC, jadi audio digabung lewat ffmpeg.wasm (±30 MB, dimuat sekali).',
    warn: false,
  },
  recorder: {
    text: 'Browser ini tidak mendukung WebCodecs. Ekspor memakai perekaman realtime (MediaRecorder) lalu konversi ffmpeg.wasm — lebih lambat, dan tab harus tetap terbuka.',
    warn: true,
  },
};

export function ExportPanel(props: {
  current: Track | null;
  settings: Settings;
  clip: { start: number; end: number };
  state: ExportState;
  onSettings: (patch: Partial<Settings>) => void;
  onClip: (clip: { start: number; end: number }) => void;
  getTime: () => number;
  onExport: () => void;
  onCancel: () => void;
}) {
  const { current, settings, clip, state } = props;
  const dur = current?.duration ?? 0;
  const running = state.status === 'running';
  const length = settings.rangeMode === 'full' ? dur : Math.max(0, clip.end - clip.start);
  const [method, setMethod] = useState<ExportMethod | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const w = settings.resolution;
    detectExportMethod(w, (w * 16) / 9, 30).then(
      (m) => alive && setMethod(m),
      () => alive && setMethod(null),
    );
    return () => {
      alive = false;
    };
  }, [settings.resolution]);

  const setStart = (s: number) => {
    const start = Math.min(Math.max(0, s), Math.max(0, dur - 1));
    props.onClip({ start, end: Math.max(clip.end, Math.min(dur, start + 1)) });
  };
  const setEnd = (e: number) => {
    const end = Math.max(Math.min(dur, e), Math.min(dur, 1));
    props.onClip({ start: Math.min(clip.start, Math.max(0, end - 1)), end });
  };

  return (
    <div className="space-y-7">
      <Section title="Rentang">
        <Segmented
          label="Rentang ekspor"
          value={settings.rangeMode}
          onChange={(v) => props.onSettings({ rangeMode: v })}
          options={[
            { value: 'full', label: 'Seluruh lagu' },
            { value: 'clip', label: 'Potongan' },
          ]}
        />
        {settings.rangeMode === 'clip' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <TimeField label="Mulai" value={clip.start} disabled={!current || running} onCommit={setStart} />
              <TimeField label="Selesai" value={clip.end} disabled={!current || running} onCommit={setEnd} />
            </div>
            <Slider label="Mulai" min={0} max={Math.max(1, dur)} step={0.1} value={clip.start} display={formatTime(clip.start)} disabled={!current || running} onChange={setStart} />
            <Slider label="Selesai" min={0} max={Math.max(1, dur)} step={0.1} value={clip.end} display={formatTime(clip.end)} disabled={!current || running} onChange={setEnd} />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!current || running} onClick={() => setStart(props.getTime())}>
                Mulai = posisi kini
              </Button>
              <Button className="flex-1" disabled={!current || running} onClick={() => setEnd(props.getTime())}>
                Selesai = posisi kini
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Resolusi">
        <Segmented
          label="Resolusi video"
          value={settings.resolution}
          onChange={(v) => props.onSettings({ resolution: v })}
          options={[
            { value: 1080, label: '1080 × 1920' },
            { value: 720, label: '720 × 1280' },
          ]}
        />
        <p className="text-xs text-white/45">
          MP4 · 30 fps · durasi {formatTime(length)} ({Math.round(length * 30)} frame)
        </p>
      </Section>

      <Section title="Ekspor video">
        {method === null && (
          <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2.5 text-sm text-red-200">
            Browser ini tidak mendukung WebCodecs maupun MediaRecorder, jadi ekspor video tidak tersedia. Coba Chrome, Edge,
            atau Safari versi terbaru.
          </p>
        )}
        {method && (
          <p
            data-testid="export-method"
            data-method={method}
            className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
              METHOD_INFO[method].warn ? 'bg-amber-500/15 text-amber-100' : 'bg-white/[0.06] text-white/55'
            }`}
          >
            {METHOD_INFO[method].text}
          </p>
        )}

        {running ? (
          <div className="space-y-3" data-testid="export-progress">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(state.ratio * 100)}
              className="h-2 overflow-hidden rounded-full bg-white/15"
            >
              <div className="h-full rounded-full bg-white transition-[width] duration-200" style={{ width: `${state.ratio * 100}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-white/60">{state.stage}</span>
              <span className="text-white/80 tabular-nums">{Math.round(state.ratio * 100)}%</span>
            </div>
            <Button variant="danger" className="w-full" onClick={props.onCancel}>
              Batal
            </Button>
          </div>
        ) : (
          <Button variant="primary" className="w-full" disabled={!current || !method || length < 0.1} onClick={props.onExport}>
            Ekspor MP4
          </Button>
        )}
        {state.status === 'done' && (
          <p data-testid="export-done" className="text-sm text-emerald-300">
            {state.message}
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" data-testid="export-error" className="text-sm text-red-300">
            {state.message}
          </p>
        )}
        {!current && <p className="text-sm text-white/45">Unggah lagu dulu untuk mengekspor video.</p>}
      </Section>
    </div>
  );
}
