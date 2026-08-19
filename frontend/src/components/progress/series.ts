import type { SeriesPoint } from '@/api/domain'
import { kgToDisplay } from '@/utils/units'

// top_weight/volume/est_1rm son magnitudes en kg (pasan por kgToDisplay);
// top_level (v0.20.x) es un número PLANO de máquina: ni se convierte ni
// comparte eje con los kg. Los puntos a 0 se filtran: significan "ese día no
// hubo series de esta magnitud" (p.ej. sesión solo-nivel en la serie de kg,
// o al revés), no un valor real.
export type MetricKey = 'top_weight' | 'volume' | 'est_1rm' | 'top_level'

export function seriesFor(
  points: SeriesPoint[],
  metric: MetricKey,
  units: 'kg' | 'lb',
): { date: string; value: number }[] {
  return points
    .map((p) => ({
      date: p.date,
      value: metric === 'top_level' ? (p.top_level ?? 0) : kgToDisplay(p[metric], units),
    }))
    .filter((p) => p.value > 0)
}
