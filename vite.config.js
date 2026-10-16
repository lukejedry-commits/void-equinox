import { defineConfig } from 'vite';
// Relative base works for the GitHub Pages project path (/void-equinox/) and locally.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022', chunkSizeWarningLimit: 4000,
    // Rapier (wasm inlined, ~2 MB) and three.js get their own long-cache chunks.
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('@dimforge/rapier3d')) return 'rapier';
      if (id.includes('node_modules/three/')) return 'three';
    } } },
  },
  server: { host: true, port: 5173 },
});
