import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 950, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
