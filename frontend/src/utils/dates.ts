export function isoDate(d: Date): string {
  // construcción manual: toISOString desplazaría el día según la zona horaria
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayIso = () => isoDate(new Date())

export function getMondayOfWeek(date: Date = new Date()): string {
  // obtener el lunes de la semana actual
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return isoDate(monday)
}

export function monthLabel(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
}

export function weekdayHeaders(locale: string): string[] {
  const monday = new Date(2026, 0, 5) // un lunes cualquiera
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
    ),
  )
}

export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)) // retroceder al lunes
  const cells: { date: string; inMonth: boolean }[] = []
  const cursor = new Date(start)
  do {
    cells.push({ date: isoDate(cursor), inMonth: cursor.getMonth() === month - 1 })
    cursor.setDate(cursor.getDate() + 1)
  } while (cursor.getMonth() === month - 1 || cells.length % 7 !== 0)
  return cells
}
