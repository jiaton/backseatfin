import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One build, three entries, served from two places:
//   admin site /           → index.html (admin, /test, /pair)
//   car host /car/         → play.html (the Emby car player) and inject.js (loaded by
//                            Emby's own page). nginx strips the /car prefix.
// base './' keeps every asset URL relative, so the same files work under both.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        play: path.resolve(import.meta.dirname, 'play.html'),
        inject: path.resolve(import.meta.dirname, 'src/inject/main.ts'),
      },
      output: {
        // Emby's page references /car/inject.js by a fixed name (no hash).
        entryFileNames: (chunk) => (chunk.name === 'inject' ? 'inject.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
