// v0.21.4 (zurdi: "mover la imagen y hacer zoom — tal cual quede en la
// preview es como se ve en los ejercicios"): el encuadre WYSIWYG de la foto
// de un ejercicio. La posición focal (%) va a object-position Y a
// transform-origin, y el zoom a scale — con el MISMO origen, el punto focal
// no se mueve al escalar, así que el mismo estilo reproduce el encuadre en
// cualquier superficie con el mismo aspect-ratio (las 9:16 de BkMedia).
// Único punto de verdad: TODO <img> de foto de ejercicio con object-cover
// debe pasar por aquí (BkMedia, thumbs sueltos, la preview del editor).
export interface ImageFramingSource {
  image_pos_x?: number | null
  image_pos_y?: number | null
  image_zoom?: number | null
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function imageFramingStyle(source?: ImageFramingSource | null): Record<string, string> {
  const x = clampPct(source?.image_pos_x ?? 50)
  const y = clampPct(source?.image_pos_y ?? 50)
  const zoom = Math.min(3, Math.max(1, source?.image_zoom ?? 1))
  const style: Record<string, string> = { objectPosition: `${x}% ${y}%` }
  if (zoom !== 1) {
    style.transform = `scale(${zoom})`
    style.transformOrigin = `${x}% ${y}%`
  }
  return style
}
