<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { getPlateConfig, setPlateConfig } from '@/utils/uiPrefs'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkStepper from '@/lib/BkStepper.vue'
import {
  BAR_OPTIONS,
  defaultPlateConfig,
  platesPerSide,
  type PlateConfig,
} from './plates'

// v0.12.0 (backlog "calculadora de discos"): peso objetivo → discos por lado.
// Se abre desde el formulario de serie de fuerza con el peso actual como
// objetivo; la barra y el inventario del gym persisten por dispositivo
// (uiPrefs) — el gym no cambia entre sesiones, el peso sí.
const props = defineProps<{ open: boolean; targetWeight: number; units: 'kg' | 'lb' }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

function loadConfig(): PlateConfig {
  const stored = getPlateConfig() as PlateConfig | null
  // config de otra unidad (el usuario cambió kg↔lb): denominaciones y barra
  // ya no aplican — se parte de los defaults de la unidad actual
  if (!stored || stored.unit !== props.units || !Array.isArray(stored.slots)) {
    return defaultPlateConfig(props.units)
  }
  return stored
}

const config = ref<PlateConfig>(loadConfig())
const target = ref(props.targetWeight)
const inventoryOpen = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) {
      config.value = loadConfig()
      target.value = props.targetWeight
      inventoryOpen.value = false
    }
  },
)

function persist() {
  setPlateConfig(config.value)
}

const barOptions = computed(() =>
  BAR_OPTIONS[props.units].map((weight) => ({ value: String(weight), label: `${weight} ${props.units}` })),
)

const result = computed(() => platesPerSide(target.value, config.value))

// agrupado para pintar: [[25, 2], [10, 1]] = 2×25 + 1×10 por lado
const grouped = computed(() => {
  const counts = new Map<number, number>()
  for (const plate of result.value.perSide) counts.set(plate, (counts.get(plate) ?? 0) + 1)
  return [...counts.entries()]
})

function formatPlate(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(weight)
}
</script>

<template>
  <BkSheet :open="open" :title="t('workout.plates.title')" @close="emit('close')">
    <div class="space-y-4" data-testid="plate-calculator">
      <div>
        <span class="block text-xs text-ink-muted mb-2 text-center">{{ t('workout.plates.target') }}</span>
        <BkStepper v-model="target" :step="units === 'kg' ? 2.5 : 5" :min="0" :max="units === 'kg' ? 500 : 1100" :suffix="units" />
      </div>

      <BkSelect
        :model-value="String(config.barWeight)"
        :label="t('workout.plates.bar')"
        :options="barOptions"
        @update:model-value="config.barWeight = Number($event); persist()"
      />

      <!-- resultado: discos POR LADO, de mayor a menor -->
      <div class="bk-slab p-3 space-y-2" data-testid="plate-result">
        <p class="text-xs text-ink-muted">{{ t('workout.plates.perSide') }}</p>
        <p v-if="target <= config.barWeight" class="text-sm text-ink-faint" data-testid="plate-bar-only">
          {{ t('workout.plates.barOnly') }}
        </p>
        <div v-else-if="grouped.length" class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="[plate, count] in grouped"
            :key="plate"
            class="bk-metric inline-flex items-center rounded-sm border border-aurora/50 bg-aurora/10 text-aurora px-2 py-1 text-sm"
            :data-testid="`plate-chip-${plate}`"
          >
            {{ count }}×{{ formatPlate(plate) }}
          </span>
        </div>
        <p v-else class="text-sm text-ink-faint">{{ t('workout.plates.none') }}</p>
        <!-- si el inventario no alcanza el objetivo exacto, decirlo SIEMPRE -->
        <p
          v-if="target > config.barWeight && !result.exact"
          class="text-xs text-ember"
          data-testid="plate-mismatch"
        >
          {{ t('workout.plates.achieved', { weight: `${result.achieved} ${units}` }) }}
        </p>
      </div>

      <!-- inventario del gym: plegado por defecto — se configura una vez -->
      <div>
        <BkButton variant="ghost" size="sm" block data-testid="plate-inventory-toggle" @click="inventoryOpen = !inventoryOpen">
          {{ t('workout.plates.inventory') }}
        </BkButton>
        <div v-if="inventoryOpen" class="mt-2 space-y-2" data-testid="plate-inventory">
          <div
            v-for="slot in config.slots"
            :key="slot.weight"
            class="flex items-center justify-between gap-3"
          >
            <span class="bk-metric text-sm text-ink w-16 shrink-0">{{ formatPlate(slot.weight) }} {{ units }}</span>
            <div class="flex-1 max-w-40">
              <BkStepper
                :model-value="slot.pairs"
                size="compact"
                :step="1"
                :min="0"
                :max="10"
                :suffix="t('workout.plates.pairs')"
                @update:model-value="slot.pairs = $event; persist()"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </BkSheet>
</template>
