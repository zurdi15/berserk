import type { SeriesPoint } from '@/api/domain'
import { kgToDisplay } from '@/utils/units'

// las 3 claves de SeriesPoint son magnitudes en kg (peso máx, volumen kg·reps,
// 1RM estimado): todas pasan por kgToDisplay igual, no solo top_weight/est_1rm
export type MetricKey = 'top_weight' | 'volume' | 'est_1rm'

export function seriesFor(
  points: SeriesPoint[],
  metric: MetricKey,
  units: 'kg' | 'lb',
): { date: string; value: number }[] {
  return points.map((p) => ({ date: p.date, value: kgToDisplay(p[metric], units) }))
}
