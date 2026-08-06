<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { WorkoutOut } from '@/api/domain'
import { createRoutine, replaceRoutineExercises } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useToastStore } from '@/stores/toast'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkSheet from '@/lib/BkSheet.vue'
import { buildRoutineExercisesFromWorkout } from './saveAsRoutine'

// item 5: sheet compartido entre FinishSummary (entreno recién terminado en
// vivo) y WorkoutEditView (entreno pasado/retroactivo) — misma composición
// del payload (ver saveAsRoutine.ts), solo cambia de dónde sale el workout
const props = defineProps<{ open: boolean; workout: WorkoutOut }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToastStore()

const name = ref('')
const saving = ref(false)

// se recalcula el nombre por defecto cada vez que se abre, no solo al montar:
// el mismo sheet puede reabrirse para un workout distinto sin remontarse
watch(
  () => props.open,
  (open) => {
    if (open) name.value = t('workout.routineNameDefault', { date: props.workout.date })
  },
  { immediate: true },
)

async function save() {
  if (!name.value.trim() || saving.value) return
  saving.value = true
  try {
    const routine = await createRoutine({ name: name.value.trim() })
    const items = buildRoutineExercisesFromWorkout(props.workout)
    // rutina sin ejercicios (entreno vacío): createRoutine ya basta, un PUT
    // con lista vacía sería un no-op redundante
    if (items.length) await replaceRoutineExercises(routine.id, items)
    toast.push('info', t('workout.savedAsRoutine'))
    emit('close')
  } catch (error) {
    toastApiError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BkSheet :open="open" :title="t('workout.saveAsRoutine')" @close="emit('close')">
    <div class="space-y-4" data-testid="save-as-routine-sheet">
      <BkField v-model="name" :label="t('workout.routineName')" />
      <BkButton
        variant="primary"
        block
        :loading="saving"
        data-testid="save-as-routine-confirm"
        @click="save"
      >
        {{ t('common.save') }}
      </BkButton>
    </div>
  </BkSheet>
</template>
