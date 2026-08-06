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

// v0.3.0 item 6: "las semanas están en vertical. Deberían estar en
// horizontal" — el eje de días de la semana (col, 0-6) pasa a ser el eje
// HORIZONTAL del bloque (antes era el vertical); las semanas (row) se
// apilan ahora hacia abajo. Ese eje horizontal es FIJO (siempre 7, ya no
// varía por mes como el viejo columnCount de 4-6 semanas), así que el
// offset de cada bloque para el barrido es simplemente su índice × 7 — el
// barrido sigue leyéndose de izquierda a derecha, ahora avanzando por día
// de la semana (todas las semanas de una misma columna revelan a la vez)
// en vez de por semana completa.
const BLOCK_WIDTH = 7
const blockOffsets = computed(() => blocks.value.map((_, i) => i * BLOCK_WIDTH))
const totalColumns = computed(() => blocks.value.length * BLOCK_WIDTH)

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
//
// round-7 re-review (side-fix 2), recalculado tras la transposición del
// item 6: grid-cols-4 reparte el ancho en 4 columnas de igual fracción
// (1fr), pero cada mini-rejilla interna usa columnas "auto" (no se encoge).
// El eje horizontal del bloque es ahora FIJO (7 días de la semana, para
// TODOS los meses — ya no varía 4-6 como el viejo eje de semanas). Con el
// tamaño ORIGINAL (celda 10px + gap 4px) el bloque mide 7*10 + 6*4 = 94px.
// <main> pone px-4 (32px totales) y el grid exterior gap-3 (12px × 3 huecos
// = 36px): a 375px de viewport solo quedan (375-32-36)/4 ≈ 76.75px por
// columna — menos que los 94px que el bloque necesita, así que desborda (y
// peor aún a 360px). Por debajo de `sm` (640px) la celda baja a 8px + gap
// 2px: 7*8 + 6*2 = 68px, que cabe con margen incluso a 360px
// ((360-32-36)/4 = 73px). Desde `sm` hay de sobra para volver al tamaño
// original (10px/4px, 94px de bloque, frente a ~143px de columna disponible).
</script>

<template>
  <div class="grid grid-cols-4 justify-items-center items-start gap-3">
    <div v-for="(block, blockIdx) in blocks" :key="`month-${block.month}`" class="flex flex-col items-center gap-1">
      <span class="text-xs text-ink-faint text-center whitespace-nowrap">{{ monthName(block.month) }}</span>
      <div
        class="grid gap-0.5 sm:gap-1"
        :style="{ gridTemplateColumns: 'repeat(7, auto)', gridTemplateRows: `repeat(${block.rowCount}, auto)` }"
      >
        <div
          v-for="cell in block.cells"
          :key="cell.date"
          :title="`${cell.date}: ${cell.count}`"
          :class="['w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-xs bk-cascade', heatClass(cell.count)]"
          :style="{
            gridColumn: cell.col + 1,
            gridRow: cell.row + 1,
            '--bk-cascade-i': blockOffsets[blockIdx] + cell.col,
            '--bk-cascade-step': `${cascadeStepMs}ms`,
          }"
        />
      </div>
    </div>
  </div>
</template>
