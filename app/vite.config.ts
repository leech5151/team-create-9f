import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * GitHub Pages project sites live under /<repo>/, so every emitted URL needs
 * that prefix. The deploy workflow passes it in as BASE_PATH; local dev and
 * any root-domain host keep the default '/'.
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Serve the SW in `npm run dev` too, so install/offline can be tested locally.
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: '볼링 레인 랜덤 배정',
        short_name: '레인 배정',
        description: '티어별로 균형 잡힌 볼링 레인을 랜덤 배정하는 앱',
        lang: 'ko',
        dir: 'ltr',
        // Relative to the manifest's own URL, so these stay correct whether the
        // app is served from the domain root or from /<repo>/.
        id: './',
        start_url: '.',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F3F0',
        theme_color: '#F4F3F0',
        categories: ['sports', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // Pretendard is CDN-hosted; cache it so the typeface survives offline.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-fonts',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5273 },
});
