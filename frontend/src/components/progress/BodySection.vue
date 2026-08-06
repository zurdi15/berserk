<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { BodyEntryOut, BodyIn } from '@/api/domain'
import { deleteBody, listBody, upsertBody } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { todayIso } from '@/utils/dates'
import { displayToKg, formatWeight, kgToDisplay } from '@/utils/units'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
import BkButton from '@/lib/BkButton.vue'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkField from '@/lib/BkField.vue'
import BkSheet from '@/lib/BkSheet.vue'

const { t } = useI18n()
const athlete = useAthleteStore()
const auth = useAuthStore()

const units = computed(() => ((athlete.viewing?.units ?? auth.user?.units ?? 'kg') as 'kg' | 'lb'))
// datos de cuerpo son de escritura estrictamente propia (el backend solo
// resuelve owner_id=CurrentUser en PUT/DELETE): en modo "viendo a X" la sección
// es de solo lectura
const isViewingSelf = computed(() => !athlete.isViewing)

const entries = ref<BodyEntryOut[]>([])
const loading = ref(false)

// listBody llega ascendente por fecha (apto tal cual para el eje del chart);
// la lista de entradas se lee mejor con la más reciente primero
const recentFirst = computed(() => [...entries.value].reverse())

const chartPoints = computed(() =>
  entries.value
    .filter((e) => e.weight_kg != null)
    .map((e) => ({ date: e.date, value: kgToDisplay(e.weight_kg!, units.value) })),
)

const measureFields: { key: keyof BodyEntryOut; label: string }[] = [
  { key: 'waist_cm', label: 'body.waist' },
  { key: 'chest_cm', label: 'body.chest' },
  { key: 'arm_cm', label: 'body.arm' },
  { key: 'thigh_cm', label: 'body.thigh' },
  { key: 'hip_cm', label: 'body.hip' },
]

function measuresLine(entry: BodyEntryOut): string {
  return measureFields
    .filter((f) => entry[f.key] != null)
    .map((f) => `${t(f.label)}: ${entry[f.key]} cm`)
    .join(' · ')
}

async function load() {
  try {
    entries.value = await listBody(athlete.userId)
  } catch (error) {
    toastApiError(error)
  }
}

// Sheet de alta (upsert por fecha)
const sheetOpen = ref(false)
const date = ref(todayIso())
const weightStr = ref('')
const waistStr = ref('')
const chestStr = ref('')
const armStr = ref('')
const thighStr = ref('')
const hipStr = ref('')
const formError = ref('')

function openAdd() {
  date.value = todayIso()
  weightStr.value = ''
  waistStr.value = ''
  chestStr.value = ''
  armStr.value = ''
  thighStr.value = ''
  hipStr.value = ''
  formError.value = ''
  sheetOpen.value = true
}

function closeSheet() {
  sheetOpen.value = false
}

function toKgOrNull(value: string): number | null {
  return value.trim() === '' ? null : displayToKg(Number(value), units.value)
}

function toCmOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

async function save() {
  // espejo cliente de la validación empty_entry del backend: nunca dejar que
  // la petición salga vacía para descubrirlo por un toast de error genérico
  const allEmpty = [weightStr, waistStr, chestStr, armStr, thighStr, hipStr].every((f) => f.value.trim() === '')
  if (allEmpty) {
    formError.value = t('body.atLeastOneRequired')
    return
  }
  formError.value = ''

  const body: BodyIn = {
    weight_kg: toKgOrNull(weightStr.value),
    waist_cm: toCmOrNull(waistStr.value),
    chest_cm: toCmOrNull(chestStr.value),
    arm_cm: toCmOrNull(armStr.value),
    thigh_cm: toCmOrNull(thighStr.value),
    hip_cm: toCmOrNull(hipStr.value),
  }

  try {
    loading.value = true
    await upsertBody(date.value, body)
    sheetOpen.value = false
    await load()
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

const deleteConfirming = ref<string | null>(null)

async function confirmDelete(entryDate: string) {
  deleteConfirming.value = null
  try {
    await deleteBody(entryDate)
    await load()
  } catch (error) {
    toastApiError(error)
  }
}

watch(() => athlete.userId, load, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <div v-if="chartPoints.length">
      <p class="text-sm text-ink-muted mb-2">{{ t('body.weightOverTime') }}</p>
      <BkChart :points="chartPoints" color="aurora" :suffix="` ${units}`" />
    </div>

    <div v-if="isViewingSelf">
      <BkButton data-testid="add-body-entry" variant="primary" size="sm" @click="openAdd">
        {{ t('body.add') }}
      </BkButton>
    </div>

    <BkEmpty v-if="!entries.length" :message="t('body.noEntries')" />
    <div v-else class="space-y-2">
      <div
        v-for="entry in recentFirst"
        :key="entry.date"
        :data-testid="`body-entry-${entry.date}`"
        class="flex items-center justify-between py-2 px-3 bg-stone rounded-sm"
      >
        <div class="min-w-0">
          <p class="text-sm text-ink">{{ entry.date }}</p>
          <p v-if="measuresLine(entry)" class="text-xs text-ink-faint truncate">{{ measuresLine(entry) }}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="bk-metric text-sm text-ink">
            {{ entry.weight_kg != null ? formatWeight(entry.weight_kg, units) : '–' }}
          </span>
          <template v-if="isViewingSelf">
            <button
              v-if="deleteConfirming !== entry.date"
              type="button"
              :data-testid="`delete-body-${entry.date}`"
              class="text-ink-faint hover:text-danger text-sm px-2"
              :aria-label="t('common.delete')"
              @click="deleteConfirming = entry.date"
            >
              ×
            </button>
            <span v-else class="flex items-center gap-1">
              <button
                type="button"
                :data-testid="`confirm-delete-body-${entry.date}`"
                class="text-danger text-xs px-2 py-1 border border-danger rounded-sm"
                @click="confirmDelete(entry.date)"
              >
                {{ t('common.confirm') }}
              </button>
              <button
                type="button"
                :data-testid="`cancel-delete-body-${entry.date}`"
                class="text-ink-faint text-xs px-2 py-1"
                @click="deleteConfirming = null"
              >
                {{ t('common.cancel') }}
              </button>
            </span>
          </template>
        </div>
      </div>
    </div>

    <BkSheet :open="sheetOpen" :title="t('body.newEntry')" @close="closeSheet">
      <div class="space-y-3">
        <BkField v-model="date" type="date" :label="t('body.date')" />
        <BkField v-model="weightStr" type="number" mono :label="`${t('body.weight')} (${units})`" />
        <BkField v-model="waistStr" type="number" mono :label="`${t('body.waist')} (cm)`" />
        <BkField v-model="chestStr" type="number" mono :label="`${t('body.chest')} (cm)`" />
        <BkField v-model="armStr" type="number" mono :label="`${t('body.arm')} (cm)`" />
        <BkField v-model="thighStr" type="number" mono :label="`${t('body.thigh')} (cm)`" />
        <BkField v-model="hipStr" type="number" mono :label="`${t('body.hip')} (cm)`" />
        <p v-if="formError" data-testid="body-form-error" class="text-sm text-danger">{{ formError }}</p>
        <BkButton data-testid="save-body-entry" variant="primary" block :loading="loading" @click="save">
          {{ t('common.save') }}
        </BkButton>
      </div>
    </BkSheet>
  </div>
</template>
