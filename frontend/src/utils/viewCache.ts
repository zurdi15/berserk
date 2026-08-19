// facelift v3 (zurdi: "que cargue instantáneo y que en segundo plano se
// hagan llamadas a la api"): cache EN MEMORIA de la última carga de cada
// sección — al volver a una vista, sus datos se hidratan de aquí al momento
// (la animación de entrada corre igual) y el fetch de siempre se repite en
// segundo plano, actualizando reactivamente lo que haya cambiado.
//
// Deliberadamente simple: un Map por pestaña de navegador (recargar la
// página = frescura total), claves con el userId del atleta donde aplica
// (ver cada consumidor), y purga completa al cerrar sesión (auth store) —
// nada de esto toca localStorage: la persistencia offline ya la dan
// offline/readCache y el snapshot del entreno, esto es solo velocidad de
// navegación.
const cache = new Map<string, unknown>()

export function getViewCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined
}

export function setViewCache<T>(key: string, value: T): void {
  cache.set(key, value)
}

export function clearViewCache(): void {
  cache.clear()
}
