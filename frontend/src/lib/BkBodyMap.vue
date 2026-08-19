<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DistributionItem, MuscleGroupOut } from '@/api/domain'

// v0.24.0 — MAPA MUSCULAR: silueta geométrica (frente + espalda) con cada
// grupo encendido en aurora según su volumen relativo de la ventana (sets /
// máximo). Estética de talla rúnica: polígonos angulares, nada de anatomía
// realista — la misma familia visual que las runas del sistema.
//
// El mapeo slug→zona cubre los grupos del catálogo sembrado (chest, back,
// biceps, triceps, shoulders, legs, core); un grupo de usuario sin zona
// simplemente no pinta aquí — las barras de debajo (DistributionBars) siguen
// siendo el listado completo, este mapa es su lectura de un vistazo.
const props = withDefaults(
  defineProps<{ items: DistributionItem[]; groups: MuscleGroupOut[] }>(),
  { items: () => [], groups: () => [] },
)

const { t, locale } = useI18n()

const setsBySlug = computed(() => {
  const groupSlugById = new Map(props.groups.map((g) => [g.id, g.slug]))
  const map = new Map<string, number>()
  for (const item of props.items) {
    const slug = groupSlugById.get(item.muscle_group_id)
    if (slug) map.set(slug, (map.get(slug) ?? 0) + item.sets)
  }
  return map
})

const maxSets = computed(() => Math.max(1, ...setsBySlug.value.values()))

// opacidad del relleno aurora: baseline tenue para que el cuerpo se lea
// entero, escala con el volumen relativo
function intensity(slug: string): number {
  const sets = setsBySlug.value.get(slug) ?? 0
  if (sets === 0) return 0.06
  return 0.18 + 0.62 * (sets / maxSets.value)
}

function label(slug: string): string {
  const group = props.groups.find((g) => g.slug === slug)
  if (!group) return slug
  const name = locale.value === 'en' ? group.name_en : group.name_es
  const sets = setsBySlug.value.get(slug) ?? 0
  return `${name} · ${t('today.bodyMapSets', { n: sets }, sets)}`
}

// ── geometría ────────────────────────────────────────────────────────────
// Dos figuras de 120×232 (frente en x=0, espalda en x=160). Polígonos
// definidos para la figura izquierda; mirror() los refleja sobre su eje
// central para el lado derecho, shift() los traslada a la figura de espalda.
type Poly = number[][]
const AX = 60 // eje de simetría de una figura

function pts(poly: Poly): string {
  return poly.map(([x, y]) => `${x},${y}`).join(' ')
}
function mirror(poly: Poly): Poly {
  return poly.map(([x, y]) => [2 * AX - x, y])
}
function shift(poly: Poly, dx: number): Poly {
  return poly.map(([x, y]) => [x + dx, y])
}

// piezas neutras (no mapean a grupo): cabeza, antebrazos, gemelos
const HEAD: Poly = [[60, 6], [73, 18], [60, 30], [47, 18]]
const FOREARM_L: Poly = [[24, 92], [36, 96], [31, 124], [21, 120]]
const CALF_L: Poly = [[45, 172], [57, 174], [55, 222], [47, 222]]

// zonas por grupo — frente
const SHOULDER_L: Poly = [[30, 40], [46, 36], [48, 52], [33, 56]]
const CHEST: Poly = [[46, 36], [74, 36], [77, 62], [60, 70], [43, 62]]
const CORE: Poly = [[44, 65], [60, 73], [76, 65], [73, 102], [60, 110], [47, 102]]
const ARM_L: Poly = [[26, 58], [40, 60], [37, 90], [23, 86]]
const THIGH_L: Poly = [[46, 114], [59, 114], [57, 168], [44, 164]]
const THIGH_R_FRONT: Poly = mirror(THIGH_L)

// espalda: torso entero + zona lumbar neutra debajo
const BACK: Poly = [[46, 36], [74, 36], [77, 62], [74, 96], [60, 104], [46, 96], [43, 62]]

const FRONT_REGIONS: { slug: string; polys: Poly[] }[] = [
  { slug: 'shoulders', polys: [SHOULDER_L, mirror(SHOULDER_L)] },
  { slug: 'chest', polys: [CHEST] },
  { slug: 'core', polys: [CORE] },
  { slug: 'biceps', polys: [ARM_L, mirror(ARM_L)] },
  { slug: 'legs', polys: [THIGH_L, THIGH_R_FRONT] },
]
const BACK_DX = 160
const BACK_REGIONS: { slug: string; polys: Poly[] }[] = [
  { slug: 'shoulders', polys: [shift(SHOULDER_L, BACK_DX), shift(mirror(SHOULDER_L), BACK_DX)] },
  { slug: 'back', polys: [shift(BACK, BACK_DX)] },
  { slug: 'triceps', polys: [shift(ARM_L, BACK_DX), shift(mirror(ARM_L), BACK_DX)] },
  { slug: 'legs', polys: [shift(THIGH_L, BACK_DX), shift(THIGH_R_FRONT, BACK_DX)] },
]

const NEUTRAL: Poly[] = [
  HEAD, FOREARM_L, mirror(FOREARM_L), CALF_L, mirror(CALF_L),
  shift(HEAD, BACK_DX), shift(FOREARM_L, BACK_DX), shift(mirror(FOREARM_L), BACK_DX),
  shift(CALF_L, BACK_DX), shift(mirror(CALF_L), BACK_DX),
]

const REGIONS = computed(() =>
  [...FRONT_REGIONS, ...BACK_REGIONS].map((region) => ({
    ...region,
    opacity: intensity(region.slug),
    title: label(region.slug),
  })),
)
</script>

<template>
  <div class="flex justify-center" data-testid="body-map">
    <svg viewBox="0 0 280 236" class="w-full max-w-72" role="img" :aria-label="t('today.bodyMap')">
      <!-- siluetas neutras: el cuerpo se lee aunque una zona esté a cero -->
      <!-- opacidades y anclas via style, no atributos de presentación SVG:
           guard-utilities confundiría esos nombres con clases de color -->
      <polygon
        v-for="(poly, i) in NEUTRAL"
        :key="`n-${i}`"
        :points="pts(poly)"
        fill="currentColor"
        class="text-ink-faint"
        :style="{ fillOpacity: 0.12 }"
      />
      <!-- zonas por grupo muscular, encendidas por volumen relativo -->
      <g v-for="region in REGIONS" :key="`${region.slug}-${region.polys[0][0][0]}`">
        <polygon
          v-for="(poly, i) in region.polys"
          :key="i"
          :points="pts(poly)"
          :data-testid="`body-map-${region.slug}`"
          fill="var(--bk-accent-aurora)"
          stroke="var(--bk-accent-aurora)"
          :style="{ fillOpacity: region.opacity, strokeOpacity: 0.35, strokeWidth: 1 }"
        >
          <title>{{ region.title }}</title>
        </polygon>
      </g>
      <!-- etiquetas frente/espalda -->
      <text x="60" y="234" :style="{ textAnchor: 'middle', fontSize: '9px' }" class="text-ink-faint" fill="currentColor">
        {{ t('today.bodyMapFront') }}
      </text>
      <text x="220" y="234" :style="{ textAnchor: 'middle', fontSize: '9px' }" class="text-ink-faint" fill="currentColor">
        {{ t('today.bodyMapBack') }}
      </text>
    </svg>
  </div>
</template>
