import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/focus/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'Focus — Personal Productivity',
        short_name: 'Focus',
        description: 'Task planning with reliable cross-device sync and Google Calendar integration',
        start_url: '/focus/',
        scope: '/focus/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#7c3aed',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/focus/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(?:accounts|apis)\.google\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
