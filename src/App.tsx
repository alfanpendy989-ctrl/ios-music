import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio/engine';
import { guessFromFilename, probeAudio, readMetadata } from './audio/metadata';
import { CropModal } from './components/CropModal';
import { CoverPanel, ExportPanel, SongPanel, WallpaperPanel } from './components/Panels';
import { PlayerPreview } from './components/PlayerPreview';
import { useMediaQuery } from './components/ui';
import { decodeAudio, exportVideo } from './export/exportVideo';
import { disposeImage, downloadBlob, loadImage, toDataUrl, type Img } from './lib/images';
import { loadSettings, loadWallpaperDataUrl, saveSettings, saveWallpaperDataUrl, type Settings } from './lib/settings';
import { PlayerRenderer, type Frame, type Scene } from './renderer/PlayerRenderer';
import type { ExportState, TabId, Toast, Track } from './types';

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|aac|flac|opus|mp4)$/i;

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'song', label: 'Lagu', icon: '♪' },
  { id: 'cover', label: 'Cover', icon: '▣' },
  { id: 'wallpaper', label: 'Wallpaper', icon: '◐' },
  { id: 'export', label: 'Ekspor', icon: '⇩' },
];

const isAudio = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name);
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 80);

let nextId = 1;

export function App() {
  const engine = useMemo(() => new AudioEngine(), []);
  const renderer = useMemo(() => new PlayerRenderer(), []);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [wallpaper, setWallpaper] = useState<Img | null>(null);
  const [clip, setClip] = useState({ start: 0, end: 30 });
  const [tab, setTab] = useState<TabId>('song');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [crop, setCrop] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle', ratio: 0, stage: '' });

  const desktop = useMediaQuery('(min-width: 1024px)');
  const current = tracks.find((t) => t.id === currentId) ?? null;

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const currentRef = useRef(current);
  currentRef.current = current;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const autoplayRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const decodedRef = useRef<{ id: string; buffer: AudioBuffer } | null>(null);

  /* ------------------------------ toast -------------------------------- */
  const toast = useCallback((text: string, kind: Toast['kind'] = 'error') => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  /* ----------------------------- settings ------------------------------ */
  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => {
    const t = setTimeout(() => saveSettings(settings), 250);
    return () => clearTimeout(t);
  }, [settings]);
  useEffect(() => engine.setVolume(settings.volume), [engine, settings.volume]);

  // pulihkan wallpaper tersimpan
  useEffect(() => {
    const data = loadWallpaperDataUrl();
    if (!data) return;
    let alive = true;
    fetch(data)
      .then((r) => r.blob())
      .then(loadImage)
      .then((img) => (alive ? setWallpaper((w) => w ?? img) : disposeImage(img)))
      .catch(() => saveWallpaperDataUrl(null));
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------ audio -------------------------------- */
  const play = useCallback(async () => {
    if (!currentRef.current) {
      toast('Unggah lagu dulu untuk mulai memutar.', 'info');
      return;
    }
    if (abortRef.current) return; // sedang ekspor
    try {
      await engine.play();
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast('Lagu tidak bisa diputar di browser ini.');
    }
  }, [engine, toast]);

  const step = useCallback(
    (dir: 1 | -1, auto = false) => {
      const list = tracksRef.current;
      const idx = list.findIndex((t) => t.id === currentRef.current?.id);
      if (idx < 0) return;
      if (dir === -1 && (engine.currentTime > 3 || idx === 0)) {
        engine.seek(0);
        return;
      }
      const next = list[idx + dir];
      if (!next) {
        if (auto || list.length === 1) {
          engine.pause();
          engine.seek(0);
        } else {
          autoplayRef.current = engine.playing;
          setCurrentId(list[0].id);
        }
        return;
      }
      autoplayRef.current = auto || engine.playing;
      setCurrentId(next.id);
    },
    [engine],
  );

  useEffect(() => {
    const a = engine.audio;
    const sync = () => setPlaying(engine.playing);
    const ended = () => {
      sync();
      step(1, true);
    };
    const error = () => {
      if (a.currentSrc || a.src) toast('Lagu gagal dimuat: format tidak didukung atau file rusak.');
      setPlaying(false);
    };
    a.addEventListener('play', sync);
    a.addEventListener('pause', sync);
    a.addEventListener('emptied', sync); // load() saat memutar tidak memicu 'pause'
    a.addEventListener('ended', ended);
    a.addEventListener('error', error);
    return () => {
      a.removeEventListener('play', sync);
      a.removeEventListener('pause', sync);
      a.removeEventListener('emptied', sync);
      a.removeEventListener('ended', ended);
      a.removeEventListener('error', error);
    };
  }, [engine, step, toast]);

  // ganti lagu → muat sumber baru
  const currentUrl = current?.url ?? null;
  const currentDuration = current?.duration ?? 0;
  useEffect(() => {
    if (!currentUrl) {
      engine.unload();
      return;
    }
    engine.load(currentUrl);
    setClip({ start: 0, end: Math.min(30, currentDuration) });
    setExportState((s) => (s.status === 'running' ? s : { status: 'idle', ratio: 0, stage: '' }));
    if (autoplayRef.current) {
      autoplayRef.current = false;
      void play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, engine]);

  const toggle = useCallback(() => (engine.playing ? engine.pause() : void play()), [engine, play]);

  /* ----------------------------- tambah lagu --------------------------- */
  const addFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      const added: Track[] = [];
      for (const file of files) {
        if (!isAudio(file)) {
          toast(`"${file.name}": format tidak didukung. Gunakan MP3, M4A, WAV, atau OGG.`);
          continue;
        }
        if (file.size > MAX_AUDIO_BYTES) {
          toast(`"${file.name}" terlalu besar (${mb(file.size)}). Maksimum ${mb(MAX_AUDIO_BYTES)}.`);
          continue;
        }
        const url = URL.createObjectURL(file);
        let duration: number;
        try {
          duration = await probeAudio(url);
        } catch {
          URL.revokeObjectURL(url);
          toast(`"${file.name}" tidak bisa diputar: format tidak didukung browser ini atau file rusak.`);
          continue;
        }
        const meta = await readMetadata(file);
        const guess = guessFromFilename(file.name);
        let cover: Img | null = null;
        if (meta.picture) cover = await loadImage(meta.picture).catch(() => null);
        added.push({
          id: `t${nextId++}`,
          file,
          url,
          title: meta.title ?? guess.title,
          artist: meta.artist ?? guess.artist,
          duration,
          cover,
          embeddedCover: cover,
        });
      }
      setLoading(false);
      if (!added.length) return;
      setTracks((t) => [...t, ...added]);
      setCurrentId((id) => id ?? added[0].id);
    },
    [toast],
  );

  const removeTrack = useCallback(
    (id: string) => {
      const list = tracksRef.current;
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const t = list[idx];
      if (currentRef.current?.id === id) {
        abortRef.current?.abort();
        autoplayRef.current = false;
        setCurrentId((list[idx + 1] ?? list[idx - 1])?.id ?? null);
      }
      setTracks((cur) => cur.filter((x) => x.id !== id));
      if (decodedRef.current?.id === id) decodedRef.current = null;
      // beri waktu pratinjau berpindah sebelum bitmap dilepas
      setTimeout(() => {
        URL.revokeObjectURL(t.url);
        if (t.cover !== t.embeddedCover) disposeImage(t.cover);
        disposeImage(t.embeddedCover);
      }, 500);
    },
    [],
  );

  const editTrack = useCallback((id: string, patch: Partial<Track>) => {
    setTracks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /* --------------------------- cover & wallpaper ----------------------- */
  const checkImage = useCallback(
    (file: File): boolean => {
      if (!isImage(file)) {
        toast(`"${file.name}" bukan gambar yang didukung (JPG, PNG, WebP).`);
        return false;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast(`"${file.name}" terlalu besar (${mb(file.size)}). Maksimum ${mb(MAX_IMAGE_BYTES)}.`);
        return false;
      }
      return true;
    },
    [toast],
  );

  const pickCover = useCallback(
    (file: File) => {
      if (!currentRef.current) {
        toast('Unggah lagu dulu untuk mengganti cover.', 'info');
        return;
      }
      if (checkImage(file)) setCrop(file);
    },
    [checkImage, toast],
  );

  const applyCover = useCallback(
    async (blob: Blob) => {
      setCrop(null);
      const t = currentRef.current;
      if (!t) return;
      try {
        const img = await loadImage(blob);
        const old = t.cover;
        editTrack(t.id, { cover: img });
        if (old && old !== t.embeddedCover) setTimeout(() => disposeImage(old), 500);
      } catch {
        toast('Gambar tidak bisa dibuka: format tidak didukung.');
      }
    },
    [editTrack, toast],
  );

  const setCover = useCallback(
    (cover: Img | null) => {
      const t = currentRef.current;
      if (!t) return;
      const old = t.cover;
      editTrack(t.id, { cover });
      if (old && old !== t.embeddedCover && old !== cover) setTimeout(() => disposeImage(old), 500);
    },
    [editTrack],
  );

  const pickWallpaper = useCallback(
    async (file: File) => {
      if (!checkImage(file)) return;
      try {
        const img = await loadImage(file);
        setWallpaper((old) => {
          if (old) setTimeout(() => disposeImage(old), 500);
          return img;
        });
        patchSettings({ wallpaperMode: 'custom' });
        saveWallpaperDataUrl(toDataUrl(img));
      } catch {
        toast(`"${file.name}" tidak bisa dibuka: format gambar tidak didukung.`);
      }
    },
    [checkImage, patchSettings, toast],
  );

  const removeWallpaper = useCallback(() => {
    setWallpaper((old) => {
      if (old) setTimeout(() => disposeImage(old), 500);
      return null;
    });
    saveWallpaperDataUrl(null);
  }, []);

  /* ------------------------------ scene -------------------------------- */
  const coverBitmap = current?.cover?.bitmap ?? null;
  const wallBitmap = settings.wallpaperMode === 'custom' ? (wallpaper?.bitmap ?? null) : null;
  const scene: Scene = useMemo(
    () => ({
      title: current ? current.title : 'Belum Ada Lagu',
      artist: current ? current.artist : 'Unggah lagu untuk mulai',
      cover: coverBitmap,
      wallpaper: wallBitmap,
      blur: settings.blur,
      darkness: settings.darkness,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.title, current?.artist, !!current, coverBitmap, wallBitmap, settings.blur, settings.darkness],
  );

  const getFrame = useCallback(
    (dt: number): Frame => ({
      currentTime: engine.currentTime,
      duration: engine.duration || currentRef.current?.duration || 0,
      playing: engine.playing,
      volume: settingsRef.current.volume,
      levels: engine.levels(dt),
    }),
    [engine],
  );

  /* ------------------------------ ekspor ------------------------------- */
  const runExport = useCallback(async () => {
    const track = currentRef.current;
    if (!track || abortRef.current) return;
    const s = settingsRef.current;
    engine.pause();
    const ac = new AbortController();
    abortRef.current = ac;
    setExportState({ status: 'running', ratio: 0, stage: 'Men-decode audio…' });
    try {
      let buffer = decodedRef.current?.id === track.id ? decodedRef.current.buffer : null;
      if (!buffer) {
        buffer = await decodeAudio(track.file);
        decodedRef.current = { id: track.id, buffer };
      }
      if (ac.signal.aborted) throw new DOMException('batal', 'AbortError');
      const duration = buffer.duration;
      const start = s.rangeMode === 'clip' ? Math.min(clip.start, duration) : 0;
      const end = s.rangeMode === 'clip' ? Math.min(clip.end, duration) : duration;
      const width = s.resolution;
      const result = await exportVideo(
        {
          renderer: new PlayerRenderer(), // kelas yang sama dengan pratinjau, cache terpisah
          scene,
          buffer,
          start,
          end,
          duration,
          volume: s.volume,
          width,
          height: (width * 16) / 9,
          fps: 30,
        },
        (p) => setExportState({ status: 'running', ratio: p.ratio, stage: p.stage }),
        ac.signal,
      );
      const name = safeName([track.title, track.artist].filter(Boolean).join(' - ')) || 'ios-music-player';
      downloadBlob(result.blob, `${name}.mp4`);
      setExportState({
        status: 'done',
        ratio: 1,
        stage: '',
        message: `Selesai — ${name}.mp4 (${(result.blob.size / 1024 / 1024).toFixed(1)} MB) terunduh.`,
      });
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') {
        setExportState({ status: 'idle', ratio: 0, stage: '' });
        toast('Ekspor dibatalkan.', 'info');
      } else {
        console.error(e);
        const msg = e instanceof Error && e.message ? e.message : 'Terjadi kesalahan tak terduga.';
        setExportState({ status: 'error', ratio: 0, stage: '', message: `Ekspor gagal: ${msg}` });
      }
    } finally {
      abortRef.current = null;
    }
  }, [clip.end, clip.start, engine, scene, toast]);

  const cancelExport = useCallback(() => abortRef.current?.abort(), []);

  /* --------------------------- drag & drop ----------------------------- */
  const handlersRef = useRef({ addFiles, pickCover });
  handlersRef.current = { addFiles, pickCover };
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const images = files.filter((f) => isImage(f) && !isAudio(f));
      const rest = files.filter((f) => !images.includes(f));
      if (rest.length) void handlersRef.current.addFiles(rest);
      if (images.length) handlersRef.current.pickCover(images[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  /* ------------------------------- UI ---------------------------------- */
  const panel = (
    <>
      {tab === 'song' && (
        <SongPanel
          tracks={tracks}
          current={current}
          playing={playing}
          loading={loading}
          onAdd={addFiles}
          onSelect={(id) => {
            if (id === currentId) return toggle();
            autoplayRef.current = true;
            setCurrentId(id);
          }}
          onRemove={removeTrack}
          onEdit={editTrack}
        />
      )}
      {tab === 'cover' && (
        <CoverPanel
          current={current}
          onPick={pickCover}
          onRestore={() => setCover(current?.embeddedCover ?? null)}
          onClear={() => setCover(null)}
        />
      )}
      {tab === 'wallpaper' && (
        <WallpaperPanel settings={settings} wallpaper={wallpaper} onSettings={patchSettings} onPick={pickWallpaper} onRemove={removeWallpaper} />
      )}
      {tab === 'export' && (
        <ExportPanel
          current={current}
          settings={settings}
          clip={clip}
          state={exportState}
          onSettings={patchSettings}
          onClip={setClip}
          getTime={() => engine.currentTime}
          onExport={runExport}
          onCancel={cancelExport}
        />
      )}
    </>
  );

  const tabButtons = (mobile: boolean) =>
    TABS.map((t) => {
      const active = tab === t.id && (!mobile || sheetOpen);
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active}
          data-testid={`tab-${t.id}`}
          onClick={() => {
            if (mobile) setSheetOpen(!(sheetOpen && tab === t.id));
            setTab(t.id);
          }}
          className={
            mobile
              ? `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200 outline-none focus-visible:bg-white/10 ${
                  active ? 'text-white' : 'text-white/45'
                }`
              : `min-h-9 flex-1 rounded-lg px-2 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  active ? 'bg-white/20 text-white shadow-sm' : 'text-white/55 hover:text-white'
                }`
          }
        >
          {mobile && (
            <span aria-hidden className="text-lg leading-none">
              {t.icon}
            </span>
          )}
          {t.label}
          {t.id === 'export' && exportState.status === 'running' && (
            <span className="sr-only"> ({Math.round(exportState.ratio * 100)}%)</span>
          )}
        </button>
      );
    });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black lg:flex-row">
      <main className="relative min-h-0 flex-1 p-3 pb-[calc(env(safe-area-inset-bottom)+68px)] lg:p-8">
        <div className="flex h-full w-full items-center justify-center" style={{ containerType: 'size' }}>
          <div style={{ width: 'min(100cqw, calc(100cqh * 9 / 16))' }}>
            <PlayerPreview
              renderer={renderer}
              scene={scene}
              getFrame={getFrame}
              onToggle={toggle}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onSeek={(t) => engine.seek(t)}
              onVolume={(v) => patchSettings({ volume: v })}
            />
          </div>
        </div>
      </main>

      {desktop ? (
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/10 bg-neutral-950">
          <header className="space-y-4 px-6 pt-6 pb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">iOS Music Player</h1>
              <p className="text-sm text-white/45">Buat video Now Playing dari lagumu.</p>
            </div>
            <div role="tablist" aria-label="Pengaturan" className="flex rounded-xl bg-white/[0.07] p-1">
              {tabButtons(false)}
            </div>
          </header>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8">{panel}</div>
        </aside>
      ) : (
        <>
          <div
            aria-hidden={!sheetOpen}
            inert={!sheetOpen}
            className={`fixed inset-x-0 bottom-0 z-30 flex max-h-[62dvh] flex-col rounded-t-3xl border-t border-white/10 bg-neutral-900/85 pb-[calc(env(safe-area-inset-bottom)+56px)] shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out ${
              sheetOpen ? 'translate-y-0' : 'translate-y-full'
            }`}
          >
            <button
              type="button"
              aria-label="Tutup panel"
              onClick={() => setSheetOpen(false)}
              className="flex h-8 w-full shrink-0 items-center justify-center outline-none"
            >
              <span className="h-1.5 w-10 rounded-full bg-white/30" />
            </button>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-6">{panel}</div>
          </div>
          <nav
            role="tablist"
            aria-label="Pengaturan"
            className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-neutral-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          >
            {tabButtons(true)}
          </nav>
        </>
      )}

      {crop && <CropModal file={crop} onDone={applyCover} onCancel={() => setCrop(null)} onError={(m) => (setCrop(null), toast(m))} />}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-white/50 px-10 py-8 text-center">
            <p className="text-xl font-semibold">Lepas file di sini</p>
            <p className="mt-1 text-sm text-white/60">Lagu masuk ke playlist · gambar menjadi cover</p>
          </div>
        </div>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`toast-in pointer-events-auto max-w-md rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl ${
              t.kind === 'error'
                ? 'border-red-400/30 bg-red-950/85 text-red-100'
                : t.kind === 'success'
                  ? 'border-emerald-400/30 bg-emerald-950/85 text-emerald-100'
                  : 'border-white/15 bg-neutral-800/90 text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
