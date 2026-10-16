import { defineConfig } from 'vite';
// Relative base works for the GitHub Pages project path (/void-equinox/) and locally.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { host: true, port: 5173 },
});
