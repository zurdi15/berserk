// Extraído de BkChart.vue (M5) para poder testear el hueco null directamente:
// dentro del <script setup>, ys siempre es number[] (BkChart.points.value no
// admite null hoy), así que esa rama nunca se ejercita desde el propio
// componente — pero SÍ es la forma real de uPlot de representar huecos en
// una serie (AlignedData admite null), y es la protección correcta si algún
// consumidor futuro pasa una serie con huecos. Se mantiene la rama (no se
// retira) y se prueba aparte, en vez de confiar en que nunca haga falta.

// un frame del tween: todos los puntos reales ya alcanzados por targetX, más
// una "punta" sintética interpolada linealmente entre el último punto
// alcanzado y el siguiente — sin esto, el trazo salta a saltos discretos
// (avanza un punto entero de golpe, nada durante varios frames) en vez de
// deslizarse continuo. targetX avanza LINEAL sobre el rango del eje X (no
// eased sobre el índice): con easing sobre el índice, los últimos puntos
// —muchos o pocos según la densidad— se apelotonaban al final del tween.
export function tweenFrame(
  xs: number[],
  ys: (number | null)[],
  targetX: number,
): [number[], (number | null)[]] {
  let i = 0
  while (i < xs.length && xs[i] <= targetX) i++
  const outX = xs.slice(0, i)
  const outY = ys.slice(0, i)

  // punta sintética solo si: queda un segmento real por delante, targetX no
  // cae justo sobre un punto real (ya incluido tal cual arriba), y ninguno
  // de los dos extremos del segmento es un hueco null — interpolar a través
  // de un null no tiene sentido; se deja el trazo clampado al punto real
  // anterior (el arranque del hueco) hasta que el hueco quede atrás.
  if (i > 0 && i < xs.length && xs[i - 1] !== targetX) {
    const x0 = xs[i - 1]
    const x1 = xs[i]
    const y0 = ys[i - 1]
    const y1 = ys[i]
    if (y0 !== null && y1 !== null) {
      const frac = (targetX - x0) / (x1 - x0)
      outX.push(targetX)
      outY.push(y0 + frac * (y1 - y0))
    }
  }
  return [outX, outY]
}
