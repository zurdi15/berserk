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

export interface MonthLabel {
  month: number // 1-12
  column: number // índice de semana (misma columna que usa cellsFor) donde cae el día 1 de ese mes
}

// una etiqueta cada ~4-5 semanas no se pisa nunca en la práctica, pero el
// offset de enero (ancla a lunes) puede dejar la primera columna muy
// estrecha — el hueco mínimo protege ese caso sin necesitar medir texto real
const MIN_LABEL_COLUMN_GAP = 2

export function monthLabelsFor(year: number): MonthLabel[] {
  const jan1 = new Date(year, 0, 1)
  const offset = (jan1.getDay() + 6) % 7
  const all: MonthLabel[] = []
  for (let month = 1; month <= 12; month++) {
    const first = new Date(year, month - 1, 1)
    const dayIndex = Math.round((first.getTime() - jan1.getTime()) / 86400000)
    all.push({ month, column: Math.floor((dayIndex + offset) / 7) })
  }
  // si un label cae demasiado cerca del anterior YA aceptado, se omite (se
  // queda el primero, más natural de lectura izquierda-derecha que al revés)
  const kept: MonthLabel[] = []
  for (const label of all) {
    const prev = kept.at(-1)
    if (prev && label.column - prev.column < MIN_LABEL_COLUMN_GAP) continue
    kept.push(label)
  }
  return kept
}
