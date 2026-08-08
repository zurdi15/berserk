// v0.12.0 (backlog "calculadora de discos"): peso objetivo → discos POR LADO.
// Trabaja en la unidad de DISPLAY del usuario (kg o lb) con denominaciones e
// inventario propios de cada unidad — sin conversiones a mitad de cuenta.
// Greedy de mayor a menor: con denominaciones estándar (cada disco ≥ la suma
// de los menores no siempre, pero el inventario POR PARES acota el error y el
// resultado enseña el "conseguido" para que la diferencia jamás sea muda.

export interface PlateSlot {
  // peso de UN disco en la unidad activa
  weight: number
  // pares disponibles en el gym (0 = no hay)
  pairs: number
}

export interface PlateConfig {
  unit: 'kg' | 'lb'
  barWeight: number
  slots: PlateSlot[]
}

export const BAR_OPTIONS: Record<'kg' | 'lb', number[]> = {
  kg: [20, 15, 10],
  lb: [45, 35, 25],
}

export function defaultPlateConfig(unit: 'kg' | 'lb'): PlateConfig {
  const denominations = unit === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5]
  return {
    unit,
    barWeight: unit === 'kg' ? 20 : 45,
    slots: denominations.map((weight) => ({ weight, pairs: 2 })),
  }
}

export interface PlateResult {
  // discos por lado, de mayor a menor (repetidos si van varios)
  perSide: number[]
  // peso total real conseguido (barra + 2×lado)
  achieved: number
  // true si conseguido == objetivo (con tolerancia de coma flotante)
  exact: boolean
}

export function platesPerSide(target: number, config: PlateConfig): PlateResult {
  const side = Math.max(0, (target - config.barWeight) / 2)
  const perSide: number[] = []
  let remaining = side
  for (const slot of [...config.slots].sort((a, b) => b.weight - a.weight)) {
    if (slot.weight <= 0 || slot.pairs <= 0) continue
    // +1e-9: 0.1+0.2 y compañía — un disco que "casi cabe" por basura binaria cabe
    const count = Math.min(slot.pairs, Math.floor(remaining / slot.weight + 1e-9))
    for (let i = 0; i < count; i++) perSide.push(slot.weight)
    remaining -= count * slot.weight
  }
  const achievedSide = perSide.reduce((sum, plate) => sum + plate, 0)
  const achieved = Math.round((config.barWeight + achievedSide * 2) * 100) / 100
  return { perSide, achieved, exact: Math.abs(achieved - target) < 0.01 }
}
