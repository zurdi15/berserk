<script setup lang="ts">
import 'uplot/dist/uPlot.min.css'

import uPlot from 'uplot'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { core } from '@/tokens'

const props = withDefaults(
  defineProps<{ points: { date: string; value: number }[]; color?: 'aurora' | 'ember' | 'ink'; suffix?: string }>(),
  { color: 'aurora', suffix: '' },
)

// item 2: uPlot pinta en <canvas>, así que CSS no puede aislar solo el trazo
// de la serie — la ESTRUCTURA (ejes, grid, labels) se monta completa y
// estable desde el frame 0 fijando scales.{x,y}.range al extremo de TODOS
// los puntos (ver pinnedRange), y es solo la SERIE la que se revela
// progresivamente con setData en un tween por rAF (ver build). Solo en el
// montaje inicial (animate=true); un cambio de props posterior (metric,
// color, suffix) redibuja al instante sin repetir el tween — quien use este
// componente debe forzar el remonte con :key para repetir la entrada
// (ver ProgressView.vue)
const host = ref<HTMLElement | null>(null)
let chart: uPlot | null = null
let observer: ResizeObserver | null = null
let raf = 0

// mismo guard que useAnimatedNumber: leído una vez, no en cada build() — un
// cambio de preferencia en marcha no debe cortar en seco un tween ya arrancado
const requestFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : null
const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : () => undefined
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
// misma duración que tenía el barrido bk-reveal que este tween sustituye
const duration = parseInt(core.dur[5], 10)

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function toXY(): [number[], number[]] {
  return [
    props.points.map((p) => new Date(p.date).getTime() / 1000),
    props.points.map((p) => p.value),
  ]
}

// rango fijo para el eje: con <2 puntos o todos iguales no hay un extremo
// real que fijar, así que se deja el auto-rango nativo de uPlot (igual que
// antes de este cambio)
function pinnedRange(values: number[]): [number, number] | undefined {
  if (values.length < 2) return undefined
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? undefined : [min, max]
}

// un frame del tween: todos los puntos reales ya alcanzados por targetX, más
// una "punta" sintética interpolada linealmente entre el último punto
// alcanzado y el siguiente — sin esto, el trazo salta a saltos discretos
// (avanza un punto entero de golpe, nada durante varios frames) en vez de
// deslizarse continuo. targetX avanza LINEAL sobre el rango del eje X (no
// eased sobre el índice): con easing sobre el índice, los últimos puntos
// —muchos o pocos según la densidad— se apelotonaban al final del tween.
function tweenFrame(xs: number[], ys: (number | null)[], targetX: number): [number[], (number | null)[]] {
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

// hueco del eje Y a medida, no fijo: con decimales + sufijo ("83.5 kg") un
// ancho fijo se quedaba corto y recortaba el primer dígito de las etiquetas
// más largas. Mide con el MISMO canvas que uPlot usa para dibujar el texto
// realmente renderizado (values ya trae el sufijo aplicado, es el array que
// se pinta) en vez de adivinar un número fijo — así vale para entrenos y
// cuerpo por igual, sea cual sea la métrica o el sufijo.
function yAxisSize(self: uPlot, values: string[] | null, axisIdx: number, cycleNum: number): number {
  const axis = self.axes[axisIdx] as any
  // uPlot vuelve a pedir el tamaño en un 2º ciclo de layout, ya con todo lo
  // demás medido: devolver el tamaño ya calculado ahí evita un bucle de
  // resize infinito (mismo patrón que la propia demo de uPlot para esto)
  if (cycleNum > 1) return axis._size ?? 40
  let size = (axis.ticks?.size ?? 0) + (axis.gap ?? 0)
  const longest = (values ?? []).reduce((acc, v) => (v != null && v.length > acc.length ? v : acc), '')
  if (longest) {
    self.ctx.font = axis.font || '12px sans-serif'
    size += self.ctx.measureText(longest).width / (uPlot.pxRatio || 1)
  }
  return Math.ceil(size)
}

function build(animate: boolean) {
  if (!host.value) return
  cancelFrame(raf)
  chart?.destroy()
  const [xs, ys] = toXY()
  const stroke = cssVar(
    props.color === 'aurora' ? '--bk-accent-aurora' : props.color === 'ember' ? '--bk-accent-ember' : '--bk-ink',
  )
  const xRange = pinnedRange(xs)
  const yRange = pinnedRange(ys)
  // fechas sin hora se anclan a UTC para que el eje no regale un día según el huso
  const opts: any = {
    width: host.value.clientWidth,
    height: 220,
    tzDate: (ts: number) => uPlot.tzDate(new Date(ts * 1000), 'UTC'),
    scales: {
      ...(xRange ? { x: { range: xRange } } : {}),
      ...(yRange ? { y: { range: yRange } } : {}),
    },
    axes: [
      { stroke: cssVar('--bk-ink-faint'), grid: { stroke: cssVar('--bk-line') } },
      {
        stroke: cssVar('--bk-ink-faint'),
        grid: { stroke: cssVar('--bk-line') },
        values: props.suffix ? (u: any, vals: any[]) => vals.map((v) => v + props.suffix) : undefined,
        size: yAxisSize,
      },
    ],
    series: [{}, { stroke, width: 2, points: { show: true, size: 5 } }],
    legend: { show: false },
  }

  // con <2 puntos no hay nada que "crecer" progresivamente (una serie de un
  // único punto no tiene un prefijo más corto que enseñar antes que el resto)
  if (!animate || reducedMotion || !requestFrame || xs.length < 2) {
    chart = new uPlot(opts, [xs, ys], host.value)
    return
  }

  // arranca vacío: los ejes/grid ya están completos (rango fijado arriba), la
  // serie crece encima con setData frame a frame
  chart = new uPlot(opts, [[], []], host.value)
  const xMin = xs[0]
  const xMax = xs[xs.length - 1]
  const start = performance.now()
  const step = (now: number) => {
    // progreso LINEAL en el tiempo, aplicado al RANGO DEL EJE X (no al
    // índice ni con easing): velocidad de barrido constante en pantalla,
    // sea cual sea la densidad de puntos en cada tramo
    const t = Math.min(1, (now - start) / duration)
    if (t < 1) {
      const targetX = xMin + t * (xMax - xMin)
      chart?.setData(tweenFrame(xs, ys, targetX))
      raf = requestFrame(step)
    } else {
      // frame final: los arrays completos exactos, sin punta sintética
      chart?.setData([xs, ys])
    }
  }
  raf = requestFrame(step)
}

onMounted(() => {
  build(true)
  observer = new ResizeObserver(() => chart?.setSize({ width: host.value!.clientWidth, height: 220 }))
  if (host.value) observer.observe(host.value)
})
watch(() => props.points, () => build(false), { deep: true })
watch(() => props.color, () => build(false))
watch(() => props.suffix, () => build(false))
onBeforeUnmount(() => {
  cancelFrame(raf)
  observer?.disconnect()
  chart?.destroy()
})
</script>

<template>
  <div ref="host" class="bk-metric text-sm" />
</template>
