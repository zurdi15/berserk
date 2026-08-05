export interface HeatCell {
  date: string
  count: number
  week: number
  day: number
}

import { isoDate } from '@/utils/dates'

export function cellsFor(year: number, data: { date: string; count: number }[]): HeatCell[] {
  const byDate = new Map(data.map((d) => [d.date, d.count]))
  const cells: HeatCell[] = []
  const jan1 = new Date(year, 0, 1)
  const offset = (jan1.getDay() + 6) % 7 // columnas ancladas a lunes
  for (let i = 0; ; i++) {
    const d = new Date(year, 0, 1 + i)
    if (d.getFullYear() !== year) break
    cells.push({
      date: isoDate(d),
      count: byDate.get(isoDate(d)) ?? 0,
      week: Math.floor((i + offset) / 7),
      day: (i + offset) % 7,
    })
  }
  return cells
}
