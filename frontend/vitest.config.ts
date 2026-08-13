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
    // storage funcional + limpio por test en CUALQUIER versión de Node —
    // el porqué completo vive en el propio setup (el ci rojo crónico)
    setupFiles: ['./src/test/setup.ts'],
    // M3: pineada a una zona que SÍ observa horario de verano (a diferencia
    // de la del entorno CI, que podría no hacerlo) — el test de la trampa
    // del desplazamiento de día en dates.spec.ts (cruzar el cambio de hora
    // de la UE) solo es significativo si la zona activa realmente cruza uno
    env: { TZ: 'Europe/Madrid' },
    // round 9: .worktrees/ (gitignored, usada por sesiones en paralelo —
    // ver .gitignore) queda DENTRO del árbol del proyecto, así que el glob
    // por defecto de vitest la recorría también, corriendo por duplicado
    // (y contaminando el resultado con) los tests de un checkout ajeno en
    // marcha. Se excluye explícitamente junto con el resto de exclusiones
    // por defecto de vitest, que si no habría que reescribir a mano.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{git,cache,output,temp}/**', '**/.worktrees/**'],
  },
})
