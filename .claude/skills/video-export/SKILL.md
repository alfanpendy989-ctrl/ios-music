---
name: video-export
description: How the MP4 export pipeline works (WebCodecs, mp4-muxer, ffmpeg.wasm, MediaRecorder) and the rules for changing it safely. Use when editing anything in src/export/, src/audio/spectrum.ts, or PlayerRenderer behaviour that affects exported video.
---

# Video export pipeline

Video is rendered **offline, frame by frame** from decoded audio, not screen-recorded,
so output stays smooth and in sync. Entry point: `src/export/exportVideo.ts`.

## Paths (chosen automatically, in order)

| # | Condition | Implementation |
|---|-----------|----------------|
| 1 | WebCodecs with H.264 + AAC | `src/export/webcodecs.ts`: `VideoEncoder` + `AudioEncoder` → `mp4-muxer` |
| 2 | WebCodecs H.264, no AAC encoder | Video rendered offline; `src/export/ffmpeg.ts` encodes audio to AAC and muxes (video stream copied, not re-encoded) |
| 3 | No WebCodecs | `src/export/recorder.ts`: `MediaRecorder` records the canvas in real time → ffmpeg.wasm converts WebM → MP4 |

`detectExportMethod()` reports which path the UI will use.

## Invariants: keep these when changing code

- **One renderer.** `src/renderer/PlayerRenderer.ts` draws both the preview and the export.
  Never add export-only drawing code; the video must match the preview.
- **Equalizer parity.** `src/audio/spectrum.ts` runs an offline FFT that mimics `AnalyserNode`
  so exported bars match live playback. Change both sides together.
- **Audio** is decoded at `EXPORT_SAMPLE_RATE` (48 kHz) by `decodeAudio()`.
- **Cancellation.** Every long loop must call `throwIfAborted(signal)` (`src/export/types.ts`)
  and report progress via `onProgress`.
- **User-facing errors** are thrown as `ExportError` with an Indonesian message (match existing text).
- **ffmpeg.wasm** (~32 MB, single-thread, no SharedArrayBuffer) is lazy-loaded only for paths 2/3.
  Don't import it statically, and don't add COOP/COEP requirements.
- Output: 1080×1920 or 720×1280, 30 fps, full song or a trimmed range (`opts.start`..`opts.end`).
  The result is built in memory, so watch memory use for long tracks.

## Verifying

1. `npm run typecheck`.
2. Run the app (see the `run-app` skill) on `localhost`, upload a short audio file, export a
   few-second range, and confirm the MP4 downloads and plays with audio.
3. To exercise path 2/3, stub `VideoEncoder`/`AudioEncoder` to `undefined` with
   `page.addInitScript` before loading the page.
