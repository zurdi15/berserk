<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkField from '@/lib/BkField.vue'
import BkTimeField from '@/lib/BkTimeField.vue'
import BkDateField from '@/lib/BkDateField.vue'
import BkSheet from '@/lib/BkSheet.vue'
import { statusClasses } from './statusClasses'
import type { ScheduledOut, RoutineOut, WorkoutSummaryOut } from '@/api/domain'
import { updateSchedule, deleteSchedule, schedule, listRoutines, startWorkout } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { formatDayLabel, formatTimeShort, todayIso } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'

const props = defineProps<{
  date: string
  scheduled: ScheduledOut[]
  workouts: WorkoutSummaryOut[]
}>()

const emit = defineEmits<{
  updated: []
}>()

const router = useRouter()
const athlete = useAthleteStore()

const isViewingSelf = computed(() => !athlete.isViewing)
// registrar un entreno retroactivo solo tiene sentido hasta hoy — un día
// futuro no tiene nada que "registrar" todavía (el backend además 422 sin
// date, pero para un futuro sí hay date: se oculta en el cliente para no
// ofrecer una acción que no encaja conceptualmente)
const isPastOrToday = computed(() => props.date <= todayIso())
const loggingPastWorkout = ref(false)

const routines = ref<RoutineOut[]>([])
const loading = ref(false)

// Form state for creating new session
// null (no ''): BkTimeField emite null al limpiar/nunca elegir hora — el ''
// del campo de hora nativo que sustituye ya no aplica
const newTime = ref<string | null>(null)
const newRoutineId = ref<string>('')
const newNote = ref('')

// Replan state
const editingId = ref<number | null>(null)
const editDate = ref('')
const editTime = ref<string | null>(null)

// Confirm dialog state
const confirmAction = ref<{ type: 'skip' | 'delete'; id: number } | null>(null)

async function loadRoutines() {
  try {
    routines.value = await listRoutines()
  } catch (error) {
    toastApiError(error)
  }
}

async function skipSession(id: number) {
  confirmAction.value = { type: 'skip', id }
}

async function confirmSkip() {
  if (!confirmAction.value || confirmAction.value.type !== 'skip') return
  const id = confirmAction.value.id
  confirmAction.value = null

  try {
    loading.value = true
    await updateSchedule(id, { status: 'skipped' })
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

async function deleteSession(id: number) {
  confirmAction.value = { type: 'delete', id }
}

function startReplan(session: ScheduledOut) {
  editingId.value = session.id
  editDate.value = session.date
  // I1: pydantic serializa la hora con segundos ("18:00:00") — pasarla tal
  // cual al trigger de BkTimeField enseñaría "18:00:00" en vez de "18:00"
  editTime.value = formatTimeShort(session.time)
}

async function saveReplan() {
  if (!editingId.value) return
  try {
    loading.value = true
    await updateSchedule(editingId.value, {
      date: editDate.value,
      time: editTime.value,
    })
    editingId.value = null
    editDate.value = ''
    editTime.value = null
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

function cancelReplan() {
  editingId.value = null
  editDate.value = ''
  editTime.value = null
}

async function confirmDelete() {
  if (!confirmAction.value || confirmAction.value.type !== 'delete') return
  const id = confirmAction.value.id
  confirmAction.value = null

  try {
    loading.value = true
    await deleteSchedule(id)
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

function editWorkout(id: number) {
  router.push({ name: 'workout-edit', params: { id } })
}

async function logPastWorkout() {
  try {
    loggingPastWorkout.value = true
    const workout = await startWorkout({ date: props.date, finished: true })
    router.push({ name: 'workout-edit', params: { id: workout.id } })
  } catch (error) {
    toastApiError(error)
  } finally {
    loggingPastWorkout.value = false
  }
}

async function createSession() {
  try {
    loading.value = true
    await schedule({
      date: props.date,
      time: newTime.value,
      routine_id: newRoutineId.value ? Number(newRoutineId.value) : null,
      note: newNote.value || null,
    })
    newTime.value = null
    newRoutineId.value = ''
    newNote.value = ''
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

loadRoutines()
</script>

<template>
  <div class="space-y-4">
    <!-- Date header -->
    <div class="mb-4">
      <h3 class="font-semibold text-ink">{{ formatDayLabel(date, $i18n.locale) }}</h3>
    </div>

    <!-- Sessions list -->
    <div class="space-y-3">
      <div
        v-for="session in scheduled"
        :key="session.id"
        class="border border-line rounded-sm p-3 space-y-2"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <p class="font-medium text-ink">{{ formatTimeShort(session.time) || '–' }}</p>
            <p v-if="session.note" class="text-sm text-ink-muted">{{ session.note }}</p>
            <p v-if="session.status === 'done'" class="text-sm text-ink-muted">{{ $t('calendar.done') }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              :data-status="session.status"
              :class="['w-2.5 h-2.5', statusClasses(session.status)]"
            />
          </div>
        </div>

        <!-- Actions -->
        <div v-if="isViewingSelf" class="flex gap-2 flex-wrap">
          <BkButton
            v-if="session.status === 'planned'"
            :data-testid="`replan-session-${session.id}`"
            variant="ghost"
            size="sm"
            @click="startReplan(session)"
          >
            {{ $t('calendar.replan') }}
          </BkButton>
          <BkButton
            v-if="session.status === 'planned'"
            :data-testid="`skip-session-${session.id}`"
            variant="ghost"
            size="sm"
            @click="skipSession(session.id)"
          >
            {{ $t('calendar.skip') }}
          </BkButton>
          <BkButton
            :data-testid="`delete-session-${session.id}`"
            variant="ghost"
            size="sm"
            @click="deleteSession(session.id)"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </div>

    <!-- Workouts already logged this day: cada uno con su affordance de editar -->
    <div v-if="workouts.length" class="space-y-3">
      <h4 class="font-medium text-ink">{{ $t('app.nav.workout') }}</h4>
      <div
        v-for="workout in workouts"
        :key="workout.id"
        class="border border-line rounded-sm p-3 flex items-center justify-between"
      >
        <p class="text-sm text-ink-muted">{{ $t('calendar.workoutEntry') }}</p>
        <BkActionBtn
          v-if="isViewingSelf"
          icon="edit"
          :data-testid="`edit-workout-${workout.id}`"
          :aria-label="$t('common.edit')"
          @click="editWorkout(workout.id)"
        />
      </div>
    </div>

    <!-- Registrar un entreno pasado: solo hoy/pasado (ver isPastOrToday) -->
    <div v-if="isViewingSelf && isPastOrToday" class="border border-line rounded-sm p-3">
      <BkButton
        variant="ghost"
        block
        data-testid="log-past-workout"
        :disabled="loggingPastWorkout"
        @click="logPastWorkout"
      >
        {{ $t('calendar.logPastWorkout') }}
      </BkButton>
    </div>

    <!-- Create new session form -->
    <div v-if="isViewingSelf" class="border border-line rounded-sm p-3 space-y-3">
      <h4 class="font-medium text-ink">{{ $t('calendar.newSession') }}</h4>
      <div class="space-y-2">
        <BkTimeField
          v-model="newTime"
          :label="$t('calendar.time')"
          :hint="$t('calendar.optional')"
        />
        <BkSelect
          v-model="newRoutineId"
          :options="[{ value: '', label: $t('calendar.selectRoutine'), disabled: true }, ...routines.map(r => ({ value: String(r.id), label: r.name }))]"
          :label="$t('calendar.routine')"
        />
        <BkField
          v-model="newNote"
          type="text"
          :label="$t('calendar.note')"
          :hint="$t('calendar.optional')"
        />
        <BkButton
          variant="primary"
          block
          :disabled="loading"
          @click="createSession"
        >
          {{ $t('calendar.schedule') }}
        </BkButton>
      </div>
    </div>

    <!-- Replan sheet -->
    <BkSheet :open="editingId !== null" :title="$t('calendar.replan')" @close="cancelReplan">
      <div v-if="editingId !== null" class="space-y-3">
        <BkDateField
          v-model="editDate"
          :label="$t('calendar.date')"
        />
        <BkTimeField
          v-model="editTime"
          :label="$t('calendar.time')"
          :hint="$t('calendar.optional')"
        />
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            block
            @click="cancelReplan"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="primary"
            block
            :disabled="loading"
            @click="saveReplan"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Confirm sheet -->
    <BkSheet :open="confirmAction !== null" :title="confirmAction?.type === 'skip' ? $t('calendar.confirmSkip') : $t('calendar.confirmDelete')" @close="confirmAction = null">
      <div v-if="confirmAction" class="space-y-4">
        <p class="text-ink-muted">
          {{ confirmAction.type === 'skip' ? $t('calendar.confirmSkipMessage') : $t('calendar.confirmDeleteMessage') }}
        </p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            block
            @click="confirmAction = null"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :data-testid="`confirm-${confirmAction.type}`"
            variant="primary"
            block
            :disabled="loading"
            @click="confirmAction.type === 'skip' ? confirmSkip() : confirmDelete()"
          >
            {{ $t('common.confirm') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>
