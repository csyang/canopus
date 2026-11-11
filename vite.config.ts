/**
 * vite.config.ts
 * Canopus — Vite Build Configuration
 *
 * Vite handles the renderer process only (React + SVG + elkjs).
 * The Electron main process and preload are compiled separately by tsc.
 *
 * Two modes:
 *   npm run dev      → Vite dev server on :5173, Electron loads from URL
 *   npm run build    → tsc compiles everything to dist/
 *                      Vite bundles renderer to dist/renderer/
 *                      Electron loads from dist/renderer/index.html
 *
 * elkjs note:
 *   elkjs ships a pre-bundled IIFE (elk.bundled.js) that includes its
 *   layout algorithms. We alias to this to avoid Vite trying to bundle
 *   the unbundled version which has dynamic requires.
 */

import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import { resolve }      from 'path';

export default defineConfig({
  plugins: [
    react({
      // Use the automatic JSX transform — no need to import React in every file
      jsxRuntime: 'automatic',
    }),
  ],

  root: '.',                        // index.html is at project root
  base: './',                       // relative paths for Electron file:// protocol
  publicDir: 'assets',              // served as / in dev; copied to dist/renderer/ in build

  resolve: {
    alias: {
      // Point to the pre-bundled elkjs build to avoid ESM/CJS issues
      'elkjs': resolve(__dirname, 'node_modules/elkjs/lib/elk.bundled.js'),
    },
  },

  build: {
    outDir:     'dist/renderer',
    emptyOutDir: true,
    target:     'chrome120',        // Electron 31 ships Chromium ~120
    sourcemap:  true,

    rollupOptions: {
      input: resolve(__dirname, 'index.html'),

      // Don't bundle Electron built-ins — they're only available in main process
      external: ['electron'],
    },
  },

  server: {
    port:        5173,
    strictPort:  true,    // fail fast if port is taken rather than silently shifting
  },

  optimizeDeps: {
    // Pre-bundle elkjs for faster dev server startup
    include: ['elkjs/lib/elk.bundled.js'],
    exclude: ['electron'],
  },
});
