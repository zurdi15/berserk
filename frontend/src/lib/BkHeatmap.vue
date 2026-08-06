<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { monthBlocksFor } from './heatmap'

const props = defineProps<{
  data: { date: string; count: number }[]
  year: number
}>()

// el idioma de los labels es el del VIEWER, no el del atleta (mismo criterio
// que el resto del calendario — ver CalendarView.vue/MonthGrid.vue)
const { locale } = useI18n()

const blocks = computed(() => monthBlocksFor(props.year, props.data))

// offset de columna GLOBAL de cada bloque (acumulado, no reinicia por mes):
// el barrido celda a celda cruza TODO el layout envuelto como una sola ola,
// con la columna de cada celda = offset de su bloque + su columna local
const blockColumnOffsets = computed(() => {
  const offsets: number[] = []
  let acc = 0
  for (const block of blocks.value) {
    offsets.push(acc)
    acc += block.columnCount
  }
  return offsets
})
const totalColumns = computed(() => blocks.value.reduce((sum, b) => sum + b.columnCount, 0))

// paso por columna en ms: se comprime si hay muchas columnas para que el
// barrido COMPLETO (primera a última columna) no pase de ~1s sea cual sea
// el nº de columnas del año (365 celdas no cambian la duración, solo cuánto
// se comprime el paso)
const MAX_SWEEP_MS = 1000
const cascadeStepMs = computed(() => MAX_SWEEP_MS / Math.max(1, totalColumns.value - 1))

// niveles como porcentaje de opacidad de color (utilidad de color con
// modificador de opacidad), no como opacity del elemento: opacity queda
// libre para el barrido de entrada (bk-cascade) — si el nivel también fuera
// opacity inline, competiría con la animación (ver why-comment de
// .bk-cascade en animations.css).
// Clases COMPLETAS y literales a propósito, sin interpolar el porcentaje:
// Tailwind extrae utilidades escaneando el texto fuente tal cual, no evalúa
// JS — una clase montada por interpolación no genera CSS.
const HEAT_CLASSES = ['bg-aurora/8', 'bg-aurora/15', 'bg-aurora/40', 'bg-aurora/70', 'bg-aurora/100']

function heatClass(count: number): string {
  return count ? HEAT_CLASSES[Math.min(count, 4)] : HEAT_CLASSES[0]
}

function monthName(month: number): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(props.year, month - 1, 1))
}

// rejilla FIJA de 3 filas × 4 meses (zurdi): un año siempre trae 12 bloques
// exactos, así que a diferencia del flex-wrap anterior no hace falta
// "envolver" nada — grid-cols-4 los reparte en un 3×4 estable, sin depender
// de cuánto ancho sobre en la última fila. justify-items-center centra cada
// bloque (label + mini-rejilla) dentro de su celda si le sobra ancho. Sin
// Transition propia en el contenedor: el barrido celda a celda de abajo YA
// es la entrada de este componente — envolverlo en otra sería la misma
// doble animación que el bug de item 4 en ShellView, a menor escala. (Nota:
// este comentario vive en <script>, no en <template>, a propósito — un
// comentario HTML como primer hijo del template lo convierte en fragmento
// de dos raíces y rompe wrapper.classes()/fallthrough de atributos de un
// solo elemento raíz.)
</script>

<template>
  <div class="grid grid-cols-4 justify-items-center items-start gap-3">
    <div v-for="(block, blockIdx) in blocks" :key="`month-${block.month}`" class="flex flex-col items-center gap-1">
      <span class="text-xs text-ink-faint text-center whitespace-nowrap">{{ monthName(block.month) }}</span>
      <div
        class="grid gap-1"
        :style="{ gridTemplateColumns: `repeat(${block.columnCount}, auto)`, gridTemplateRows: 'repeat(7, 1fr)' }"
      >
        <div
          v-for="cell in block.cells"
          :key="cell.date"
          :title="`${cell.date}: ${cell.count}`"
          :class="['w-2.5 h-2.5 rounded-xs bk-cascade', heatClass(cell.count)]"
          :style="{
            gridColumn: cell.column + 1,
            gridRow: cell.day + 1,
            '--bk-cascade-i': blockColumnOffsets[blockIdx] + cell.column,
            '--bk-cascade-step': `${cascadeStepMs}ms`,
          }"
        />
      </div>
    </div>
  </div>
</template>
