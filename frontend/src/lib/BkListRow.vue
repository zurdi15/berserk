<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'

import BkRune from './BkRune.vue'
import type { RuneName } from './runes'

// facelift: fila de lista estilo referencia (perfil, feed, listas de
// ejercicios) — pozo de icono a la izquierda, etiqueta grande + subetiqueta,
// chevron opcional. bg-slab a propósito: en claro, el token slab ES
// literalmente la fila gris de la referencia; en oscuro es el nivel elevado.
// Con `to` rinde RouterLink; sin él, <button> (abre sheets, acciones).
// Slots: leading (sustituye al pozo de runa), default (contenido extra tras
// la etiqueta), trailing (antes del chevron).
withDefaults(
  defineProps<{
    label: string
    sublabel?: string
    rune?: RuneName | null
    to?: RouteLocationRaw
    chevron?: boolean
  }>(),
  { chevron: false },
)
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="bk-press flex w-full items-center gap-3 rounded-lg bg-slab p-4 text-left transition-colors hover:bg-line/50"
  >
    <slot name="leading">
      <span v-if="rune" class="flex items-center justify-center w-10 h-10 rounded-md bg-stone shrink-0">
        <BkRune :name="rune" :size="20" class="text-ink-muted" />
      </span>
    </slot>
    <span class="flex-1 min-w-0 block">
      <span class="block text-base font-medium text-ink truncate">{{ label }}</span>
      <span v-if="sublabel" class="block text-sm text-ink-muted truncate">{{ sublabel }}</span>
      <slot />
    </span>
    <slot name="trailing" />
    <svg
      v-if="chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-5 h-5 shrink-0 text-ink-faint"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  </component>
</template>
