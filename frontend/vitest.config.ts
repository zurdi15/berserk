import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    // M3: pineada a una zona que SÍ observa horario de verano (a diferencia
    // de la del entorno CI, que podría no hacerlo) — el test de la trampa
    // del desplazamiento de día en dates.spec.ts (cruzar el cambio de hora
    // de la UE) solo es significativo si la zona activa realmente cruza uno
    env: { TZ: 'Europe/Madrid' },
  },
})
