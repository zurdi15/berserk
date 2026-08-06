import { isoDate } from '@/utils/dates'

export interface MonthCell {
  date: string
  count: number
  column: number // columna LOCAL dentro del bloque de SU mes (0-based, no del año)
  day: number // fila de la semana: 0 lunes .. 6 domingo
}

export interface MonthBlock {
  month: number // 1-12
  columnCount: number // nº de columnas (semanas) que ocupa el bloque de este mes
  cells: MonthCell[] // solo los días de este mes — las semanas de frontera no
  // traen huecos del mes vecino, cada bloque solo sabe de sí mismo
}

// fila de la semana anclada a lunes (mismo criterio que el resto del
// calendario: MonthGrid.vue, monthGrid() en utils/dates.ts)
function weekdayRow(date: Date): number {
  return (date.getDay() + 6) % 7
}

// bloques por mes en vez de una rejilla continua estilo GitHub: la rejilla
// continua dejaba columnas vacías a mitad de año y las etiquetas de mes no
// quedaban centradas sobre "su" tramo — con bloques independientes cada mes
// es su propia mini-rejilla (día 1 siempre en la columna 0) y el hueco entre
// bloques (flex gap en BkHeatmap.vue) separa visualmente los meses de verdad.
// Una semana de frontera (a caballo entre dos meses) aparece partida: cada
// bloque solo rellena SUS días de esa semana, el resto de filas quedan vacías
// (sin celda, no con un hueco explícito) en ese bloque.
export function monthBlocksFor(year: number, data: { date: string; count: number }[]): MonthBlock[] {
  const byDate = new Map(data.map((d) => [d.date, d.count]))
  const blocks: MonthBlock[] = []
  for (let month = 1; month <= 12; month++) {
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstRow = weekdayRow(new Date(year, month - 1, 1))
    const cells: MonthCell[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day)
      const position = firstRow + (day - 1)
      const iso = isoDate(date)
      cells.push({
        date: iso,
        count: byDate.get(iso) ?? 0,
        column: Math.floor(position / 7),
        day: position % 7,
      })
    }
    const columnCount = Math.floor((firstRow + daysInMonth - 1) / 7) + 1
    blocks.push({ month, columnCount, cells })
  }
  return blocks
}
