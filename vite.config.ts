/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// MONSTER SYNTH — tablet-first PWA.
// `base: './'` keeps every asset path relative so the build also works from a sub-path
// (static hosting, a preview link, or an embedded demo).
// `VITE_DEMO=1` builds the embeddable single-file demo: no service worker, every
// asset inlined (see scripts/build-demo.mjs).
const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  base: './',
  resolve: demo ? { alias: { 'virtual:pwa-register': '/src/pwa-stub.ts' } } : undefined,
  plugins: [
    react(),
    !demo &&
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Monster Synth',
        short_name: 'Monster Synth',
        description: 'Make Noise. Make Monsters. Make Music.',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#141646',
        theme_color: '#141646',
        categories: ['music', 'kids', 'education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: demo
    ? { target: 'es2022', outDir: 'dist-demo', assetsInlineLimit: 10_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 2000 }
    : { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
