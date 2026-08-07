// Extraído de BkChart.vue (v0.4.0 light theme): uPlot pinta la serie en
// <canvas>, así que el color no puede quedar "aislado" en CSS como el resto
// de la app — hay que RESOLVERLO a un string concreto en cada build(),
// leyendo el custom property ya calculado por el navegador (que sí respeta
// html.bk-light en cascada). Aislado en su propio módulo para poder testear
// la resolución sin montar un componente ni mockear uplot.
export type ChartColor = 'aurora' | 'ember' | 'ink'

const VAR_BY_COLOR: Record<ChartColor, string> = {
  aurora: '--bk-accent-aurora',
  ember: '--bk-accent-ember',
  ink: '--bk-ink',
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// nunca cachea: cada llamada relee el DOM, así que un cambio de tema entre
// dos builds (ver el listener de 'bk:theme-change' en BkChart.vue) siempre
// resuelve al color YA VIGENTE, nunca al de cuando se montó el componente
export function resolveSeriesStroke(color: ChartColor): string {
  return cssVar(VAR_BY_COLOR[color])
}
