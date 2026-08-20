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
      // v0.37.0: el SW nuevo espera a que el usuario pulse "Actualizar" (ver
      // utils/appUpdate.ts) — con autoUpdate la PWA de iOS se quedaba en la
      // versión vieja hasta que alguien la mataba del todo. El registro lo
      // hace appUpdate.ts, no el script inyectado
      registerType: 'prompt',
      injectRegister: false,
      // shell precacheado, datos siempre online: sin cache de runtime del API
      workbox: {
        // el fallback de navegación del SW no debe interceptar /api/*: si no,
        // una petición fetch a la API que falle de red cae al index.html
        navigateFallbackDenylist: [/^\/api\//],
        // el shell offline necesita las fuentes latin en el precache (por defecto
        // workbox solo mete js/css/html); los demás subsets quedan online-only
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'assets/*-latin-[0-9w]*.woff2'],
        // v0.36.0 Web Push: handlers push/notificationclick propios (public/
        // sw-push.js) sin renunciar al precache generado — ver ese fichero
        importScripts: ['sw-push.js'],
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
