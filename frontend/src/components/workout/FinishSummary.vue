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
  if (!props.workout.started_at || !props.workout.ended_at) return ''
  const ms = new Date(props.workout.ended_at).getTime() - new Date(props.workout.started_at).getTime()
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
})

const totalSets = computed(() =>
  props.workout.exercises.reduce((sum, e) => sum + e.sets.filter((s) => !s.is_warmup).length, 0),
)

// volumen efectivo: reps × kg de las series no-calentamiento con ambos
// valores. v0.18.0: las series en modo nivel quedan fuera POR SERIE (su
// weight_kg es un número plano, no kg — mismo criterio que el backend)
const totalVolume = computed(() =>
  props.workout.exercises.reduce((sum, e) => {
    const exerciseVolume = e.sets
      .filter((s) => !s.is_warmup && s.weight_kg != null && s.reps != null && (s.load_mode ?? 'weight') !== 'level')
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
  // v0.18.0: nivel = número plano sin unidad, leído DEL récord
  if ((record.load_mode ?? 'weight') === 'level') return `${record.value}`
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
  <!-- facelift: cierre CELEBRATORIO — la runa de la casa tallándose grande,
       "¡Entreno terminado!" y la duración como métrica protagonista; sets y
       volumen en tiles; el resto (PRs, feeling, nota, estirado) debajo -->
  <section class="bk-slab p-5 space-y-5">
    <div class="flex flex-col items-center gap-2 text-center pt-2">
      <BkRune name="berserk" :size="72" carve tone="aurora" />
      <h2 class="bk-display text-ink">{{ t('workout.finished') }}</h2>
      <p class="bk-metric text-4xl text-ink" data-testid="summary-duration">{{ durationLabel }}</p>
      <p class="text-sm text-ink-muted">{{ t('workout.duration') }}</p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-md bg-slab p-3">
        <p class="text-ink-muted text-sm">{{ t('workout.totalSets') }}</p>
        <p class="bk-metric text-3xl text-ink" data-testid="summary-sets">{{ animatedTotalSets ?? 0 }}</p>
      </div>
      <div class="rounded-md bg-slab p-3">
        <p class="text-ink-muted text-sm">{{ t('workout.totalVolume') }}</p>
        <p class="bk-metric text-3xl text-ink" data-testid="summary-volume">{{ formatWeightInt(animatedTotalVolume ?? 0, units) }}</p>
      </div>
    </div>

    <div v-if="records.length" class="space-y-2 border-t border-line pt-4">
      <p class="text-sm text-ink-muted">{{ t('workout.newRecords') }}</p>
      <div v-for="record in records" :key="record.id" class="flex items-center gap-3 rounded-lg bg-slab p-3 text-ember">
        <BkRune name="pr" :size="24" tone="ember" />
        <span class="text-base font-medium">
          {{ t(`progress.kinds.${record.kind}`) }} · {{ formatRecordValue(record) }}
        </span>
      </div>
    </div>

    <div class="space-y-2 border-t border-line pt-4">
      <p class="text-sm text-ink-muted">{{ t('workout.feeling') }}</p>
      <div class="flex gap-2">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          :data-testid="`feeling-${n}`"
          class="bk-press flex-1 flex items-center justify-center h-12 rounded-md border transition-colors"
          :class="feeling === n ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-label="`${t('workout.feeling')} ${n}`"
          @click="pickFeeling(n)"
        >
          <BkRune name="berserk" :size="22" />
        </button>
      </div>
    </div>

    <BkField v-model="note" :label="t('workout.note')" />

    <!-- estirado: mismo contrato (botón con aria-pressed) con el check
         grande del rediseño como visual — span, no BkCheck: un botón dentro
         de otro botón sería HTML inválido -->
    <button
      type="button"
      data-testid="stretched-toggle"
      class="bk-press flex items-center gap-3 text-base"
      :class="stretched ? 'text-aurora' : 'text-ink-muted'"
      :aria-pressed="stretched ? 'true' : 'false'"
      @click="toggleStretched"
    >
      <span
        class="flex items-center justify-center w-7 h-7 rounded-md border-2 shrink-0 transition-colors"
        :class="stretched ? 'border-aurora bg-aurora-deep text-void' : 'border-line-strong text-transparent'"
        aria-hidden="true"
      >
        <svg v-if="stretched" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
          <path d="M4 12.5l5 5L20 7" />
        </svg>
      </span>
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

    <BkButton variant="primary" size="lg" block @click="emit('close')">{{ t('workout.finishClose') }}</BkButton>

    <SaveAsRoutineSheet :open="saveAsRoutineOpen" :workout="workout" @close="saveAsRoutineOpen = false" />
  </section>
</template>
