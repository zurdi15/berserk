<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { BodyEntryOut, BodyIn } from '@/api/domain'
import { deleteBody, listBody, upsertBody } from '@/api/domain'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { toastApiError } from '@/utils/apiErrors'
import { todayIso } from '@/utils/dates'
import { displayToKg, formatWeight, kgToDisplay } from '@/utils/units'
import { useAthleteStore } from '@/stores/athlete'
import BkButton from '@/lib/BkButton.vue'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkField from '@/lib/BkField.vue'
import BkSheet from '@/lib/BkSheet.vue'

const { t } = useI18n()
const athlete = useAthleteStore()

const units = useDisplayUnits()
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

// snapshot canónico (kg/cm tal cual llegaron del backend) y las cadenas que
// se mostraron al precargar: si el usuario no toca un campo, se reenvía el
// valor canónico original en vez de reconvertirlo — el viaje kg→lb(1dp)→
// kg(2dp) desplaza el valor (80 kg → 176.4 lb → 80.01 kg) aunque nadie lo
// haya editado
const prefill = ref<{
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  hip_cm: number | null
}>({ weight_kg: null, waist_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null })
const prefillDisplay = ref({ weight: '', waist: '', chest: '', arm: '', thigh: '', hip: '' })

// el backend hace upsert por fecha con reemplazo completo (PUT /body/{date}):
// abrir el sheet en blanco sobre una fecha que ya tiene entrada borraría sus
// valores previos en cuanto se guarde. fillForm precarga desde la entrada
// existente (si la hay) para que guardar sea siempre una edición, no un reset.
function fillForm(entry: BodyEntryOut | undefined, dateStr: string) {
  date.value = dateStr
  weightStr.value = entry?.weight_kg != null ? String(kgToDisplay(entry.weight_kg, units.value)) : ''
  waistStr.value = entry?.waist_cm != null ? String(entry.waist_cm) : ''
  chestStr.value = entry?.chest_cm != null ? String(entry.chest_cm) : ''
  armStr.value = entry?.arm_cm != null ? String(entry.arm_cm) : ''
  thighStr.value = entry?.thigh_cm != null ? String(entry.thigh_cm) : ''
  hipStr.value = entry?.hip_cm != null ? String(entry.hip_cm) : ''
  formError.value = ''

  prefill.value = {
    weight_kg: entry?.weight_kg ?? null,
    waist_cm: entry?.waist_cm ?? null,
    chest_cm: entry?.chest_cm ?? null,
    arm_cm: entry?.arm_cm ?? null,
    thigh_cm: entry?.thigh_cm ?? null,
    hip_cm: entry?.hip_cm ?? null,
  }
  prefillDisplay.value = {
    weight: weightStr.value,
    waist: waistStr.value,
    chest: chestStr.value,
    arm: armStr.value,
    thigh: thighStr.value,
    hip: hipStr.value,
  }
}

function entryFor(dateStr: string): BodyEntryOut | undefined {
  return entries.value.find((e) => e.date === dateStr)
}

function openAdd() {
  const today = todayIso()
  fillForm(entryFor(today), today)
  sheetOpen.value = true
}

function openEdit(entry: BodyEntryOut) {
  fillForm(entry, entry.date)
  sheetOpen.value = true
}

function closeSheet() {
  sheetOpen.value = false
}

// el backend reemplaza por fecha completa: editar sin precargar borra lo
// previo — por eso, si el usuario cambia la fecha a una que ya tiene entrada,
// hay que recargar sus valores. Si la fecha no tiene entrada previa, se deja
// lo ya escrito tal cual (no hay nada que fusionar todavía).
watch(date, (newDate) => {
  const existing = entryFor(newDate)
  if (existing) fillForm(existing, newDate)
})

function toKgOrNull(value: string): number | null {
  return value.trim() === '' ? null : displayToKg(Number(value), units.value)
}

function toCmOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

// si la cadena mostrada sigue siendo la que se precargó, el campo no fue
// tocado: se reenvía el canónico original en vez de reconvertirlo
function resolveField(
  current: string,
  original: string,
  canonical: number | null,
  convert: (value: string) => number | null,
): number | null {
  return current === original ? canonical : convert(current)
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
    weight_kg: resolveField(weightStr.value, prefillDisplay.value.weight, prefill.value.weight_kg, toKgOrNull),
    waist_cm: resolveField(waistStr.value, prefillDisplay.value.waist, prefill.value.waist_cm, toCmOrNull),
    chest_cm: resolveField(chestStr.value, prefillDisplay.value.chest, prefill.value.chest_cm, toCmOrNull),
    arm_cm: resolveField(armStr.value, prefillDisplay.value.arm, prefill.value.arm_cm, toCmOrNull),
    thigh_cm: resolveField(thighStr.value, prefillDisplay.value.thigh, prefill.value.thigh_cm, toCmOrNull),
    hip_cm: resolveField(hipStr.value, prefillDisplay.value.hip, prefill.value.hip_cm, toCmOrNull),
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
              type="button"
              :data-testid="`edit-body-${entry.date}`"
              class="text-ink-faint hover:text-aurora text-xs px-2"
              @click="openEdit(entry)"
            >
              {{ t('common.edit') }}
            </button>
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
