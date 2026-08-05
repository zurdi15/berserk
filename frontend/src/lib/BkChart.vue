<script setup lang="ts">
import 'uplot/dist/uPlot.min.css'

import uPlot from 'uplot'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ points: { date: string; value: number }[]; color?: 'aurora' | 'ember' | 'ink'; suffix?: string }>(),
  { color: 'aurora', suffix: '' },
)

const host = ref<HTMLElement | null>(null)
let chart: uPlot | null = null
let observer: ResizeObserver | null = null

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function build() {
  if (!host.value) return
  chart?.destroy()
  const stroke = cssVar(
    props.color === 'aurora' ? '--bk-accent-aurora' : props.color === 'ember' ? '--bk-accent-ember' : '--bk-ink',
  )
  chart = new uPlot(
    {
      width: host.value.clientWidth,
      height: 220,
      axes: [
        { stroke: cssVar('--bk-ink-faint'), grid: { stroke: cssVar('--bk-line') } },
        { stroke: cssVar('--bk-ink-faint'), grid: { stroke: cssVar('--bk-line') } },
      ],
      series: [{}, { stroke, width: 2, points: { show: true, size: 5 } }],
      legend: { show: false },
    },
    [
      props.points.map((p) => new Date(p.date).getTime() / 1000),
      props.points.map((p) => p.value),
    ],
    host.value,
  )
}

onMounted(() => {
  build()
  observer = new ResizeObserver(() => chart?.setSize({ width: host.value!.clientWidth, height: 220 }))
  if (host.value) observer.observe(host.value)
})
watch(() => props.points, build, { deep: true })
watch(() => props.color, build)
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.destroy()
})
</script>

<template>
  <div ref="host" class="bk-metric text-sm" />
</template>
