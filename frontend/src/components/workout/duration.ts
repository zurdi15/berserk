// h:mm:ss / m:ss: el MISMO formato de duración lo pintan la tarjeta (series
// registradas, últimas veces de cardio, etiqueta de "Empezar"), el resumen de
// historia y el picker de arranque de cardio — vivía copiado literal en dos
// sitios y este lane iba a ser el tercero.
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// v0.11.5 (zurdi: "cuando se inicia un ejercicio de cardio se tiene que poder
// elegir cuánto tiempo vas a hacer ese cardio"): rango del picker que abre
// "Empezar" en la card de cardio. Presets en MINUTOS porque es como se piensa
// un cardio ("media hora de cinta", no "1800 s"); el ajuste fino sigue en
// segundos para no perder objetivos que no caen en minutos redondos (los
// precargados desde la sesión anterior, p.ej.). El máximo (6 h) es el mismo
// que ya tenía el stepper de duración del cajón.
export const CARDIO_DURATION_PRESETS_MINUTES = [5, 10, 15, 20, 30, 45] as const
export const CARDIO_DURATION_STEP_SECONDS = 30
export const CARDIO_DURATION_MIN_SECONDS = 30
export const CARDIO_DURATION_MAX_SECONDS = 21600
