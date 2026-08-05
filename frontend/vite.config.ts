import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // shell precacheado, datos siempre online: sin cache de runtime del API
      workbox: {
        // el fallback de navegación del SW no debe interceptar /api/*: si no,
        // una petición fetch a la API que falle de red cae al index.html
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'berserk',
        short_name: 'berserk',
        description: 'Workout tracker',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0A0C0F',
        background_color: '#0A0C0F',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
