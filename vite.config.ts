import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/food-life-archive-mvp/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '我的味觉档案 · 验证版',
        short_name: '味觉档案',
        description: '把日常美食照片变成只属于你的味觉人生榜。',
        theme_color: '#FFF7EC',
        background_color: '#FFF7EC',
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
