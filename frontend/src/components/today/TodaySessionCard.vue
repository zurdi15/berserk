<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import BkCard from '@/lib/BkCard.vue'
import BkButton from '@/lib/BkButton.vue'
import BkRing from '@/lib/BkRing.vue'
import { todayIso } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'

interface ScheduledSession {
  id: number
  date: string
  time: string | null
  routine_id: number | null
  status: string
  workout_id: number | null
  note: string | null
}

interface Exercise {
  id: number
  name_es: string
  name_en: string
}

interface MuscleGroup {
  id: number
  slug: string
  name_es: string
  name_en: string
}

const props = withDefaults(
  defineProps<{
    schedules: ScheduledSession[]
    exercises: Exercise[]
    muscleGroups: MuscleGroup[]
  }>(),
  {
    schedules: () => [],
    exercises: () => [],
    muscleGroups: () => [],
  },
)

const { t } = useI18n()
const router = useRouter()
const athlete = useAthleteStore()
const auth = useAuthStore()

const today = computed(() => todayIso())

const todaySessions = computed(() =>
  props.schedules.filter((s) => s.date === today.value),
)

const plannedSession = computed(() =>
  todaySessions.value.find((s) => s.status === 'planned'),
)

const isViewingSelf = computed(() => !athlete.isViewing)

const statusDot = (status: string) => {
  if (status === 'planned') return 'aurora'
  if (status === 'done') return 'aurora'
  if (status === 'skipped') return 'ink-faint'
  return 'ink-faint'
}

function startWorkout() {
  if (plannedSession.value) {
    router.push({
      name: 'workout',
      query: { session: plannedSession.value.id },
    })
  }
}

function goToCalendar() {
  router.push({ name: 'calendar' })
}
</script>

<template>
  <BkCard :title="$t('today.todaySession')">
    <div v-if="todaySessions.length === 0" class="space-y-4">
      <p class="text-ink-muted">{{ $t('today.noSession') }}</p>
      <BkButton v-if="isViewingSelf" variant="ghost" block @click="goToCalendar">
        {{ $t('today.scheduleSession') }}
      </BkButton>
    </div>

    <div v-else class="space-y-3">
      <div v-for="session in todaySessions" :key="session.id" class="flex items-center gap-3">
        <BkRing :value="session.status === 'done' ? 1 : 0" :size="32" :stroke="2" :class="{
          'text-aurora': ['planned', 'done'].includes(session.status),
          'text-ink-faint': session.status === 'skipped',
        }" />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-ink">{{ session.time || '–' }}</p>
          <p v-if="session.note" class="text-sm text-ink-muted truncate">{{ session.note }}</p>
        </div>
      </div>

      <BkButton
        v-if="isViewingSelf && plannedSession"
        variant="primary"
        block
        @click="startWorkout"
      >
        {{ $t('today.startWorkout') }}
      </BkButton>
    </div>
  </BkCard>
</template>
