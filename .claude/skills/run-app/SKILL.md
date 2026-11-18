---
name: run-app
description: Install, run, typecheck, build and visually check the iOS Music Player web app (Vite + React + TypeScript). Use when asked to start the dev server, build, preview, or confirm a UI/renderer change works in the browser.
---

# Run the iOS Music Player app

Browser-only app (no backend). Requires Node.js `^20.19.0 || >=22.12.0` (Vite 8).

## Commands

```bash
npm install          # first time / after package.json changes
npm run dev          # dev server, usually http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build to dist/
npm run preview      # serve dist/
```

Always run `npm run typecheck` (or `npm run build`) after code changes; there is no test suite.

## Checking a change visually

1. Start `npm run dev` in the background and read the actual port from its output.
2. Open it with Playwright (Chromium is preinstalled; `require('playwright')`, `chromium.launch()`).
   Use `localhost`, not a LAN IP: WebCodecs only exists in a secure context, and on
   `http://<lan-ip>` export silently falls back to the MediaRecorder path.
3. The player is drawn on a 1080×1920 canvas by `src/renderer/PlayerRenderer.ts`;
   screenshot the page or call `canvas.toDataURL()` to inspect the frame.
4. To test uploads, use `page.setInputFiles()` on the file inputs in
   `src/components/Panels.tsx` (songs: MP3/M4A/WAV/OGG ≤ 200 MB; images ≤ 30 MB).

## Notes

- `vite.config.ts` excludes `@ffmpeg/ffmpeg` and `@ffmpeg/core` from prebundling; keep it that way.
- `base: './'` makes the build work from any sub-path.
- Settings (blur, darkness, volume, resolution, wallpaper) persist in `localStorage`;
  clear it when a test needs a clean state.
