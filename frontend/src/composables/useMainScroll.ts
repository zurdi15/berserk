// v0.5.0 (modelo de scroll único, ver ShellView.vue): <main> es el único
// scroller de la app. El reset entre SECCIONES lo hace ShellView observando
// route.path; este helper es para los cambios de pestaña DENTRO de una vista
// (useTabHash cambia el hash, no el path, y los paneles ya no tienen scroller
// propio que nazca en 0 al remontar). querySelector directo y no un
// provide/inject: hay UN <main> en la app por construcción (el shell), y las
// vistas que llaman esto solo existen dentro de él; en tests sin shell el
// querySelector devuelve null y el reset es un no-op silencioso a propósito.
export function resetMainScroll() {
  const main = document.querySelector('main')
  if (main) main.scrollTop = 0
}
