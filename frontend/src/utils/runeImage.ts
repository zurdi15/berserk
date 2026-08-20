import { RUNES, type RuneName } from '@/lib/runes'

// v0.34.1 (zurdi: "si la rutina no tiene imagen, en vez del logo de la app
// que se muestre la runa que lleva asociada, como en el hero del pre-inicio").
// Las notificaciones nativas necesitan un bitmap: aquí se rasteriza la MISMA
// runa que pinta BkRune (trazo de 2 sobre rejilla 32×32, aurora sobre el
// vacío) a un PNG como data URL que la shell decodifica igual que una foto.
// Los colores se leen de los tokens ya aplicados en el documento (ningún hex
// aquí, como en theme.ts), así que la runa sale del tema vigente. Sin canvas
// (tests, entornos raros) devuelve undefined y la shell pinta su reserva.
const SIZE = 192
const cache = new Map<string, string | undefined>()

function token(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export async function runeDataUrl(name: RuneName): Promise<string | undefined> {
  const background = token('--bk-bg-void')
  const stroke = token('--bk-accent-aurora')
  const key = `${name}|${background}|${stroke}`
  if (cache.has(key)) return cache.get(key)
  let url: string | undefined
  try {
    if (typeof document !== 'undefined' && background && stroke && typeof Path2D !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, SIZE, SIZE)
        // la runa ocupa el 60 % central, como en el hero
        const scale = (SIZE * 0.6) / 32
        const offset = (SIZE - 32 * scale) / 2
        ctx.translate(offset, offset)
        ctx.scale(scale, scale)
        ctx.strokeStyle = stroke
        ctx.lineWidth = 2
        ctx.lineCap = 'square'
        ctx.stroke(new Path2D(RUNES[name]))
        url = canvas.toDataURL('image/png')
      }
    }
  } catch {
    url = undefined
  }
  cache.set(key, url)
  return url
}
