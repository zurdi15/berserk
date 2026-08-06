import { parseUtc } from './datetime'

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

export function formatDayLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
}

// variante corta (BkDateField, gatillo del trigger): sin día de la semana,
// mes abreviado — formatDayLabel es demasiado largo para caber en un campo
export function formatDateShort(iso: string, locale: string): string {
  // BkDateField.modelValue no admite null, pero antes de que el consumidor
  // tenga un valor real ('' momentáneo) new Date(NaN, ...) formatearía
  // "Invalid Date" — mejor una cadena vacía que ese texto en el trigger
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
}

// suma días/meses vía constructor LOCAL (nunca Date.parse(iso) ni
// toISOString): ese es justo el patrón que evita la trampa del desplazamiento
// de día por zona horaria (ver isoDate arriba). setDate/setMonth operan sobre
// el calendario local; un cambio de horario de verano de por medio no mueve
// el y-m-d que pedimos, lo resuelve el motor de JS por debajo.
export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return isoDate(date)
}

export function addMonths(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  // día 1 primero: construir ya con el día real (p.ej. 31) sobre un mes con
  // menos días desbordaría al mes siguiente antes de poder acotarlo
  const first = new Date(y, m - 1 + delta, 1)
  const daysInTarget = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  first.setDate(Math.min(d, daysInTarget))
  return isoDate(first)
}

export function formatTimeShort(hms: string | null): string | null {
  return hms ? hms.slice(0, 5) : hms
}

// para started_at/ended_at (datetime UTC-naive completo, no una hora suelta):
// formatTimeShort de arriba recorta un STRING de hora y NO sirve aquí — un
// slice ingenuo del datetime leería la hora UTC cruda, no la LOCAL del
// viewer. parseUtc interpreta el valor correctamente como UTC y de ahí se lee
// la hora local con getHours/getMinutes (ver item 2, round 10).
export function formatDateTimeShort(datetime: string | null): string | null {
  if (!datetime) return null
  const date = parseUtc(datetime)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
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
