import { isoDate } from '@/utils/dates'

export interface MonthCell {
  date: string
  count: number
  row: number // fila dentro del bloque = semana (0-based)
  col: number // columna dentro del bloque = día de la semana (0 lunes .. 6 domingo)
}

export interface MonthBlock {
  month: number // 1-12
  rowCount: number // nº de filas (semanas) que ocupa el bloque de este mes
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
// es su propia mini-rejilla (día 1 siempre en la fila 0) y el hueco entre
// bloques (flex gap en BkHeatmap.vue) separa visualmente los meses de verdad.
// Una semana de frontera (a caballo entre dos meses) aparece partida: cada
// bloque solo rellena SUS días de esa semana, el resto de columnas quedan
// vacías (sin celda, no con un hueco explícito) en ese bloque.
//
// v0.3.0 item 6: "las semanas están en vertical. Deberían estar en
// horizontal" — cada semana era antes una COLUMNA (7 días apilados en
// vertical); ahora cada semana es una FILA (7 días en horizontal, las
// semanas se apilan hacia abajo). `row`/`rowCount` sustituyen a lo que antes
// era `column`/`columnCount`; `col` (0-6, día de la semana) es el eje nuevo,
// antes era `day`. La única diferencia real es qué eje del grid CSS usa cada
// uno — ver BkHeatmap.vue.
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
        row: Math.floor(position / 7),
        col: position % 7,
      })
    }
    const rowCount = Math.floor((firstRow + daysInMonth - 1) / 7) + 1
    blocks.push({ month, rowCount, cells })
  }
  return blocks
}
