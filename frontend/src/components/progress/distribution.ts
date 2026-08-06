// ancho de barra relativo al máximo del conjunto, como porcentaje de texto
// ("62%") listo para :style="{ width }"
export function barWidth(sets: number, max: number): string {
  if (max <= 0) return '0%'
  return `${Math.round((sets / max) * 100)}%`
}
