import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные адреса работают и в подпапке GitHub Pages.
  base: './',
  resolve: { dedupe: ['three', 'iwer'] },
  build: { chunkSizeWarningLimit: 700 },
});
