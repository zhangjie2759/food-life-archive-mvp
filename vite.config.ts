import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/food-life-archive-mvp/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '我的美食榜 · 私人美食评审局',
        short_name: '我的美食榜',
        description: '拍照、识别、比较、入榜；建立只服务于你的红榜与黑榜。',
        theme_color: '#111111',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: './#/record',
        scope: './',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp}'],
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: true },
    }),
  ],
})
