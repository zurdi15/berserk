// El backend siempre habla en kg; lb existe solo en la capa de presentación.
const LB_PER_KG = 2.20462

export function kgToDisplay(kg: number, units: 'kg' | 'lb'): number {
  return units === 'kg' ? kg : Math.round(kg * LB_PER_KG * 10) / 10
}

export function displayToKg(value: number, units: 'kg' | 'lb'): number {
  return units === 'kg' ? value : Math.round((value / LB_PER_KG) * 100) / 100
}

export function formatWeight(kg: number, units: 'kg' | 'lb'): string {
  return `${kgToDisplay(kg, units)} ${units}`
}

// v0.17.0 (zurdi: "números planos, del 1 al 20, en vez de kg"): la carga de
// un ejercicio en modo 'level' es un número plano de máquina — se pinta TAL
// CUAL, sin unidad y sin conversión kg/lb (el nivel 12 es 12 en cualquier
// unidad). Todo punto que formatee la carga de una serie/objetivo debe pasar
// por aquí en vez de por formatWeight a pelo.
export function formatLoad(
  value: number,
  units: 'kg' | 'lb',
  loadMode: 'weight' | 'level' = 'weight',
): string {
  return loadMode === 'level' ? `${value}` : formatWeight(value, units)
}

// para magnitudes DERIVADAS/agregadas (est. 1RM, volumen) — zurdi: "los kg...
// no pueden tener decimales". Los pesos REALES (registrados/objetivo) NUNCA
// pasan por aquí, conservan su precisión real (formatWeight de arriba).
// Redondea el valor YA CONVERTIDO a la unidad de salida (no el kg crudo):
// en kg da un entero exacto; en lb redondea el lb ya convertido a entero,
// mismo criterio "sin decimales" en las dos unidades, no solo en kg.
export function formatWeightInt(kg: number, units: 'kg' | 'lb'): string {
  return `${Math.round(kgToDisplay(kg, units))} ${units}`
}
