<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PersonalRecordOut, WorkoutOut } from '@/api/domain'
import { updateWorkout } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { formatWeight } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'

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

function formatRecordValue(record: PersonalRecordOut): string {
  if (record.kind === 'max_weight' || record.kind === 'est_1rm') {
    return formatWeight(record.value, units.value)
  }
  return String(record.value)
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
        <p class="bk-metric text-xl text-ink">{{ durationLabel }}</p>
      </div>
      <div>
        <p class="text-ink-muted text-sm">{{ t('workout.totalSets') }}</p>
        <p class="bk-metric text-xl text-ink">{{ totalSets }}</p>
      </div>
      <div class="col-span-2">
        <p class="text-ink-muted text-sm">{{ t('workout.totalVolume') }}</p>
        <p class="bk-metric text-xl text-ink">{{ formatWeight(totalVolume, units) }}</p>
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

    <BkButton variant="primary" block @click="emit('close')">{{ t('workout.finishClose') }}</BkButton>
  </section>
</template>
