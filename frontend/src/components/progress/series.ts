import type { SeriesPoint } from '@/api/domain'
import { kgToDisplay } from '@/utils/units'

// top_weight/volume/est_1rm son magnitudes en kg (pasan por kgToDisplay);
// top_level (v0.20.x) es un número PLANO de máquina: ni se convierte ni
// comparte eje con los kg. Los puntos a 0 se filtran: significan "ese día no
// hubo series de esta magnitud" (p.ej. sesión solo-nivel en la serie de kg,
// o al revés), no un valor real.
export type MetricKey =
  | 'top_weight'
  | 'volume'
  | 'est_1rm'
  | 'top_level'
  | 'duration'
  | 'distance'
  | 'pace'

function metricValue(p: SeriesPoint, metric: MetricKey, units: 'kg' | 'lb'): number {
  switch (metric) {
    // v0.23.0: cardio/timed progresan por TIEMPO — minutos con un decimal,
    // sin conversión de unidades de peso
    case 'duration':
      return Math.round(((p.duration_seconds ?? 0) / 60) * 10) / 10
    // v0.24.0: distancia en km (2 decimales) y ritmo en min/km (1 decimal)
    // — el ritmo solo existe si la sesión tiene AMBAS magnitudes
    case 'distance':
      return Math.round(((p.distance_m ?? 0) / 1000) * 100) / 100
    case 'pace': {
      const km = (p.distance_m ?? 0) / 1000
      const min = (p.duration_seconds ?? 0) / 60
      return km > 0 && min > 0 ? Math.round((min / km) * 10) / 10 : 0
    }
    case 'top_level':
      return p.top_level ?? 0
    default:
      return kgToDisplay(p[metric], units)
  }
}

export function seriesFor(
  points: SeriesPoint[],
  metric: MetricKey,
  units: 'kg' | 'lb',
): { date: string; value: number }[] {
  return points
    .map((p) => ({ date: p.date, value: metricValue(p, metric, units) }))
    .filter((p) => p.value > 0)
}

// v0.24.0: qué métricas tienen sentido para este ejercicio y estos datos —
// compartido por el panel de Entrenos (ProgressView) y la vista detalle.
// Duración-based (cardio/timed): Tiempo siempre; Distancia si hay alguna;
// Ritmo si alguna sesión tiene ambas. Fuerza: kg + Nivel si hay series de
// nivel.
export function metricOptionsFor(points: SeriesPoint[], durationBased: boolean): MetricKey[] {
  if (durationBased) {
    const metrics: MetricKey[] = ['duration']
    if (points.some((p) => (p.distance_m ?? 0) > 0)) metrics.push('distance')
    if (points.some((p) => (p.distance_m ?? 0) > 0 && (p.duration_seconds ?? 0) > 0))
      metrics.push('pace')
    return metrics
  }
  const metrics: MetricKey[] = ['top_weight', 'volume', 'est_1rm']
  if (points.some((p) => (p.top_level ?? 0) > 0)) metrics.push('top_level')
  return metrics
}

// sufijo del eje/tooltip por métrica — '' para nivel (número plano)
export function metricSuffix(metric: MetricKey, units: 'kg' | 'lb'): string {
  if (metric === 'top_level') return ''
  if (metric === 'duration') return ' min'
  if (metric === 'distance') return ' km'
  if (metric === 'pace') return ' min/km'
  return ` ${units}`
}

// v0.24.0 (zurdi: rango temporal en gráficas): 3M/6M/1A/Todo
export type RangeKey = '3m' | '6m' | '1y' | 'all'
export const RANGE_MONTHS: Record<RangeKey, number | null> = { '3m': 3, '6m': 6, '1y': 12, all: null }

export function filterRange(
  points: { date: string; value: number }[],
  range: RangeKey,
  today: Date = new Date(),
): { date: string; value: number }[] {
  const months = RANGE_MONTHS[range]
  if (months === null) return points
  const cutoff = new Date(today)
  cutoff.setMonth(cutoff.getMonth() - months)
  const iso = cutoff.toISOString().slice(0, 10)
  return points.filter((p) => p.date >= iso)
}

// mapa métrica → clave i18n bajo progress.metric.*
export const METRIC_LABEL_KEY: Record<MetricKey, string> = {
  top_weight: 'weight',
  volume: 'volume',
  est_1rm: 'est1rm',
  top_level: 'level',
  duration: 'duration',
  distance: 'distance',
  pace: 'pace',
}
