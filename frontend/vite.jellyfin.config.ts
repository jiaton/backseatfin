import path from 'node:path'
import { defineConfig } from 'vite'

// The Jellyfin plugin's web files: the car player (play.html, Jellyfin source), the
// car-mode switch (car.html) and inject.js, nothing else (no admin site, no JSMpeg). Built into dist-jellyfin/, which
// the plugin embeds and serves at <jellyfin>/BackseatFin/. Relative asset URLs, so a
// Jellyfin base URL (/jellyfin/BackseatFin/…) works too.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'jellyfin'),
  base: './',
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-jellyfin'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        play: path.resolve(import.meta.dirname, 'jellyfin/play.html'),
        car: path.resolve(import.meta.dirname, 'jellyfin/car.html'),
        inject: path.resolve(import.meta.dirname, 'src/inject/main.ts'),
      },
      output: {
        // Jellyfin's page loads inject.js by a fixed name (no hash).
        entryFileNames: (chunk) => (chunk.name === 'inject' ? 'inject.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
