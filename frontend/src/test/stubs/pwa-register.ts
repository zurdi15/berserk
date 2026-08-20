// stub de virtual:pwa-register para vitest (el módulo virtual solo existe
// dentro del build de vite-plugin-pwa); los tests que lo necesiten lo mockean
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => {}
}
