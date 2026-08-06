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
  const total = xs.length
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    if (t < 1) {
      const n = Math.max(1, Math.round(eased * total))
      chart?.setData([xs.slice(0, n), ys.slice(0, n)])
      raf = requestFrame(step)
    } else {
      // frame final: los arrays completos exactos, sin depender del redondeo
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
