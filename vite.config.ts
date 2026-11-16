import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // Izinkan akses lewat alamat pratinjau/proxy (bukan hanya localhost).
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  // ffmpeg.wasm membuat module worker sendiri; jangan di-prebundle.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  build: { target: ['es2020', 'chrome87', 'firefox78', 'safari14'], chunkSizeWarningLimit: 1500 },
});
