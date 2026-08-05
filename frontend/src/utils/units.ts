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
