# iOS Music Player

Website pembuat video "Now Playing" bergaya iPhone. Unggah lagu, atur cover dan
wallpaper, lalu ekspor menjadi video MP4 vertikal (9:16) — semuanya berjalan di
browser, tanpa backend.

## Menjalankan

Butuh Node.js 20.19+ atau 22.12+ (syarat Vite 8).

```bash
npm install
npm run dev
```

Buka alamat yang ditampilkan Vite (biasanya http://localhost:5173).

Perintah lain:

```bash
npm run build     # typecheck + build produksi ke dist/
npm run preview   # menyajikan hasil build
```

> WebCodecs hanya tersedia di *secure context*: `localhost` atau HTTPS.
> Kalau dibuka lewat `http://<ip-lan>`, ekspor otomatis memakai jalur cadangan.

## Dipakai di semua perangkat

Aplikasi ini berjalan sepenuhnya di browser, jadi cukup di-hosting sekali lalu dibuka dari HP, tablet, atau komputer mana pun.

- **Hosting (GitHub Pages)**: workflow `.github/workflows/deploy.yml` mem-build dan men-deploy otomatis setiap ada push ke `main`. Aktifkan sekali di *Settings → Pages → Source: GitHub Actions*. Hasil `npm run build` (folder `dist/`) juga bisa diunggah ke hosting statis apa pun (Netlify, Vercel, Cloudflare Pages). Harus HTTPS supaya ekspor video (WebCodecs) aktif.
- **Pasang sebagai aplikasi (PWA)**: di Android/desktop pilih *Install app*; di iPhone/iPad pilih *Share → Add to Home Screen*. Setelah kunjungan pertama aplikasi bisa dibuka tanpa internet.
- **Tata letak**: HP potret memakai bottom sheet; HP mendatar, tablet mendatar, dan desktop memakai panel samping.
- **Browser minimum**: Chrome/Edge 111+, Safari 16.4+ (iOS 16.4+), Firefox 128+. Ekspor memilih jalur otomatis sesuai kemampuan browser (lihat tabel di bawah).

## Fitur

- **Tampilan Now Playing iOS** pada kanvas 1080×1920: wallpaper blur, kartu kaca,
  cover art, judul/artis, equalizer 5 bar, progress bar + waktu, tombol
  ⏮ ⏯ ⏭, slider volume, dan pill AirPlay "iPhone".
- **Upload lagu** (MP3/M4A/WAV/OGG) lewat tombol atau drag & drop. Judul, artis,
  dan cover diisi otomatis dari metadata (jsmediatags); jika tidak ada, dari
  nama file `Artis - Judul.mp3`.
- **Edit judul & artis**, **ganti cover** (dengan crop persegi), **ganti
  wallpaper** (gambar sendiri atau cover yang di-blur) plus slider blur dan
  kegelapan.
- **Player sungguhan**: play/pause, seek, volume, playlist, lanjut otomatis.
- **Ekspor MP4** 1080×1920 atau 720×1280, 30 fps, seluruh lagu atau potongan,
  dengan progress bar dan tombol batal.
- Pengaturan terakhir (blur, kegelapan, volume, resolusi, wallpaper) disimpan
  di `localStorage`. File lagu tidak disimpan.

## Cara kerja ekspor

Video dirender **offline, frame demi frame** dari audio yang sudah di-decode —
bukan rekaman layar — sehingga hasilnya mulus dan sinkron. Jalur dipilih
otomatis sesuai kemampuan browser:

| Jalur | Syarat | Cara kerja |
| --- | --- | --- |
| 1 | WebCodecs dengan H.264 + AAC | `VideoEncoder` + `AudioEncoder` → `mp4-muxer` |
| 2 | WebCodecs H.264 tanpa encoder AAC | Video dirender offline; ffmpeg.wasm meng-encode audio ke AAC dan menggabungkannya (video disalin, tidak di-encode ulang) |
| 3 | Tanpa WebCodecs | `MediaRecorder` merekam kanvas secara realtime → ffmpeg.wasm mengonversi WebM ke MP4 |

ffmpeg.wasm (±32 MB, single-thread, tanpa SharedArrayBuffer) hanya diunduh saat
jalur 2 atau 3 dipakai.

## Struktur

```
src/
  renderer/PlayerRenderer.ts  satu-satunya penggambar tampilan player (Canvas 2D);
                              dipakai pratinjau DAN ekspor, jadi video = pratinjau
  renderer/blur.ts, icons.ts  blur gambar & ikon bergaya SF Symbols
  components/PlayerPreview.tsx kanvas pratinjau + kontrol interaktif
  components/Panels.tsx       panel Lagu, Cover, Wallpaper, Ekspor
  components/CropModal.tsx    crop persegi untuk cover
  audio/engine.ts             <audio> + Web Audio (AnalyserNode, GainNode)
  audio/spectrum.ts           level equalizer; FFT offline yang meniru AnalyserNode
  audio/metadata.ts           jsmediatags
  export/                     WebCodecs, MediaRecorder, ffmpeg.wasm
```

## Batasan

- Ukuran file: lagu maks. 200 MB, gambar maks. 30 MB.
- Hasil ekspor disusun di memori; untuk lagu yang sangat panjang pakai 720p
  atau ekspor potongan.
- Font SF Pro hanya ada di perangkat Apple; di perangkat lain dipakai Inter
  (dibundel, tidak perlu internet).
