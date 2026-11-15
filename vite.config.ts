import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // ffmpeg.wasm membuat module worker sendiri; jangan di-prebundle.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
