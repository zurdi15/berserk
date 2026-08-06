<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PersonalRecordOut, WorkoutOut } from '@/api/domain'
import { updateWorkout } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAnimatedNumber } from '@/composables/useAnimatedNumber'
import { useAuthStore } from '@/stores/auth'
import { formatWeight, formatWeightInt } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import SaveAsRoutineSheet from './SaveAsRoutineSheet.vue'

const props = withDefaults(
  defineProps<{ workout: WorkoutOut; records?: PersonalRecordOut[] }>(),
  { records: () => [] },
)
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()

const units = computed(() => ((auth.user?.units as 'kg' | 'lb') || 'kg'))

const feeling = ref(props.workout.feeling)
const note = ref(props.workout.note || '')
// item 8: "check en el entreno" — se refleja al toque, sin esperar la
// respuesta (mismo criterio optimista que feeling, que ya mutaba el ref
// local antes del await)
const stretched = ref(props.workout.stretched)
const saveAsRoutineOpen = ref(false)
let noteTimeout: ReturnType<typeof setTimeout> | null = null

const durationLabel = computed(() => {
  if (!props.workout.started_at || !props.workout.ended_at) return '–'
  const ms = new Date(props.workout.ended_at).getTime() - new Date(props.workout.started_at).getTime()
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
})

const totalSets = computed(() =>
  props.workout.exercises.reduce((sum, e) => sum + e.sets.filter((s) => !s.is_warmup).length, 0),
)

// volumen efectivo: reps × kg de las series no-calentamiento con ambos valores
const totalVolume = computed(() =>
  props.workout.exercises.reduce((sum, e) => {
    const exerciseVolume = e.sets
      .filter((s) => !s.is_warmup && s.weight_kg != null && s.reps != null)
      .reduce((acc, s) => acc + s.weight_kg! * s.reps!, 0)
    return sum + exerciseVolume
  }, 0),
)

const animatedTotalSets = useAnimatedNumber(() => totalSets.value)
// totalVolume es una magnitud DERIVADA (suma agregada de reps×kg): zurdi
// pidió sin decimales — decimals:0 (default) para el tween, formatWeightInt
// para el valor final
const animatedTotalVolume = useAnimatedNumber(() => totalVolume.value)

// los 3 kinds de PR son magnitudes en kg: todos pasan por formatWeight/Int
// (ver PrList/RecentPrs/BkCelebration — antes max_volume se mostraba sin
// convertir). max_weight es un peso REAL registrado: conserva su precisión.
// est_1rm/max_volume son DERIVADOS: sin decimales
function formatRecordValue(record: PersonalRecordOut): string {
  return record.kind === 'max_weight'
    ? formatWeight(record.value, units.value)
    : formatWeightInt(record.value, units.value)
}

async function pickFeeling(value: number) {
  feeling.value = value
  try {
    await updateWorkout(props.workout.id, { feeling: value })
  } catch (error) {
    toastApiError(error)
  }
}

async function saveNote() {
  try {
    await updateWorkout(props.workout.id, { note: note.value || null })
  } catch (error) {
    toastApiError(error)
  }
}

async function toggleStretched() {
  stretched.value = !stretched.value
  try {
    await updateWorkout(props.workout.id, { stretched: stretched.value })
  } catch (error) {
    stretched.value = !stretched.value
    toastApiError(error)
  }
}

// nota con debounce: evita un request por tecla, igual que la búsqueda de ejercicios
watch(note, () => {
  if (noteTimeout) clearTimeout(noteTimeout)
  noteTimeout = setTimeout(saveNote, 600)
})
</script>

<template>
  <section class="bk-slab p-4 space-y-4">
    <h2 class="font-display font-semibold uppercase tracking-wider text-sm text-ink">
      {{ t('workout.summary') }}
    </h2>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <p class="text-ink-muted text-sm">{{ t('workout.duration') }}</p>
        <p class="bk-metric text-xl text-ink" data-testid="summary-duration">{{ durationLabel }}</p>
      </div>
      <div>
        <p class="text-ink-muted text-sm">{{ t('workout.totalSets') }}</p>
        <p class="bk-metric text-xl text-ink" data-testid="summary-sets">{{ animatedTotalSets ?? 0 }}</p>
      </div>
      <div class="col-span-2">
        <p class="text-ink-muted text-sm">{{ t('workout.totalVolume') }}</p>
        <p class="bk-metric text-xl text-ink" data-testid="summary-volume">{{ formatWeightInt(animatedTotalVolume ?? 0, units) }}</p>
      </div>
    </div>

    <div v-if="records.length" class="space-y-2 border-t border-line pt-3">
      <p class="text-sm text-ink-muted">{{ t('workout.newRecords') }}</p>
      <div v-for="record in records" :key="record.id" class="flex items-center gap-2 text-ember">
        <BkRune name="pr" :size="20" tone="ember" />
        <span class="text-sm font-medium">
          {{ t(`progress.kinds.${record.kind}`) }} — {{ formatRecordValue(record) }}
        </span>
      </div>
    </div>

    <div class="space-y-2 border-t border-line pt-3">
      <p class="text-sm text-ink-muted">{{ t('workout.feeling') }}</p>
      <div class="flex gap-2">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          :data-testid="`feeling-${n}`"
          class="p-2 rounded-sm border"
          :class="feeling === n ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-label="`${t('workout.feeling')} ${n}`"
          @click="pickFeeling(n)"
        >
          <BkRune name="berserk" :size="20" />
        </button>
      </div>
    </div>

    <BkField v-model="note" :label="t('workout.note')" />

    <button
      type="button"
      data-testid="stretched-toggle"
      class="bk-press flex items-center gap-2 text-sm"
      :class="stretched ? 'text-aurora' : 'text-ink-muted'"
      :aria-pressed="stretched ? 'true' : 'false'"
      @click="toggleStretched"
    >
      <span
        class="w-4 h-4 rounded-xs border shrink-0"
        :class="stretched ? 'border-aurora bg-aurora/20' : 'border-line'"
        aria-hidden="true"
      />
      {{ t('workout.stretched') }}
    </button>

    <BkButton
      variant="ghost"
      block
      data-testid="save-as-routine-btn"
      @click="saveAsRoutineOpen = true"
    >
      {{ t('workout.saveAsRoutine') }}
    </BkButton>

    <BkButton variant="primary" block @click="emit('close')">{{ t('workout.finishClose') }}</BkButton>

    <SaveAsRoutineSheet :open="saveAsRoutineOpen" :workout="workout" @close="saveAsRoutineOpen = false" />
  </section>
</template>
