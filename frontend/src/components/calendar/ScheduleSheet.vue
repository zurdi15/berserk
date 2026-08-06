<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import BkCard from '@/lib/BkCard.vue'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkField from '@/lib/BkField.vue'
import type { ScheduledOut, RoutineOut } from '@/api/domain'
import { updateSchedule, deleteSchedule, schedule, listRoutines } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAthleteStore } from '@/stores/athlete'

const props = defineProps<{
  date: string
  scheduled: ScheduledOut[]
}>()

const emit = defineEmits<{
  updated: []
}>()

const router = useRouter()
const athlete = useAthleteStore()

const isViewingSelf = computed(() => !athlete.isViewing)

const routines = ref<RoutineOut[]>([])
const loading = ref(false)

// Form state for creating new session
const newTime = ref('')
const newRoutineId = ref<string>('')
const newNote = ref('')

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

async function createSession() {
  try {
    loading.value = true
    await schedule({
      date: props.date,
      time: newTime.value || null,
      routine_id: newRoutineId.value ? Number(newRoutineId.value) : null,
      note: newNote.value || null,
    })
    newTime.value = ''
    newRoutineId.value = ''
    newNote.value = ''
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

function navigateToWorkout(workoutId: number) {
  router.push({ name: 'workout', query: { id: workoutId } })
}

loadRoutines()
</script>

<template>
  <div class="space-y-4">
    <!-- Date header -->
    <div class="mb-4">
      <h3 class="font-semibold text-ink">{{ date }}</h3>
    </div>

    <!-- Sessions list -->
    <div class="space-y-3">
      <div
        v-for="session in scheduled"
        :key="session.id"
        class="border border-ink-border rounded-sm p-3 space-y-2"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <p class="font-medium text-ink">{{ session.time || '–' }}</p>
            <p v-if="session.note" class="text-sm text-ink-muted">{{ session.note }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              :class="[
                'w-2.5 h-2.5 rounded-full',
                session.status === 'planned' ? 'border-2 border-aurora' : '',
                session.status === 'done' ? 'bg-aurora' : '',
                session.status === 'skipped' ? 'bg-ink-faint' : '',
              ]"
            />
          </div>
        </div>

        <!-- Actions -->
        <div v-if="isViewingSelf" class="flex gap-2 flex-wrap">
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
          <BkButton
            v-if="session.status === 'done' && session.workout_id"
            variant="ghost"
            size="sm"
            @click="navigateToWorkout(session.workout_id)"
          >
            {{ $t('calendar.viewWorkout') }}
          </BkButton>
        </div>
      </div>
    </div>

    <!-- Create new session form -->
    <div v-if="isViewingSelf" class="border border-ink-border rounded-sm p-3 space-y-3">
      <h4 class="font-medium text-ink">{{ $t('calendar.newSession') }}</h4>
      <div class="space-y-2">
        <BkField
          v-model="newTime"
          type="time"
          :label="$t('calendar.time')"
        />
        <BkSelect
          v-model="newRoutineId"
          :options="routines.map(r => ({ value: String(r.id), label: r.name }))"
          :label="$t('calendar.routine')"
        />
        <BkField
          v-model="newNote"
          type="text"
          :label="$t('calendar.note')"
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

    <!-- Confirm modals -->
    <div v-if="confirmAction" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-sm mx-4">
        <h3 class="font-semibold text-ink mb-2">
          {{ confirmAction.type === 'skip' ? $t('calendar.confirmSkip') : $t('calendar.confirmDelete') }}
        </h3>
        <p class="text-ink-muted mb-4">
          {{ confirmAction.type === 'skip' ? $t('calendar.confirmSkipMessage') : $t('calendar.confirmDeleteMessage') }}
        </p>
        <div class="flex gap-2 justify-end">
          <BkButton
            variant="ghost"
            @click="confirmAction = null"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :data-testid="`confirm-${confirmAction.type}`"
            variant="primary"
            :disabled="loading"
            @click="confirmAction.type === 'skip' ? confirmSkip() : confirmDelete()"
          >
            {{ $t('common.confirm') }}
          </BkButton>
        </div>
      </div>
    </div>
  </div>
</template>
