<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import BkCard from '@/lib/BkCard.vue'
import BkButton from '@/lib/BkButton.vue'
import type { ScheduledOut } from '@/api/domain'
import { todayIso } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'

const props = withDefaults(
  defineProps<{
    schedules: ScheduledOut[]
  }>(),
  {
    schedules: () => [],
  },
)

const router = useRouter()
const athlete = useAthleteStore()

const today = computed(() => todayIso())

const todaySessions = computed(() =>
  props.schedules.filter((s) => s.date === today.value),
)

const plannedSession = computed(() =>
  todaySessions.value.find((s) => s.status === 'planned'),
)

const isViewingSelf = computed(() => !athlete.isViewing)

const statusClasses = (status: string) => {
  if (status === 'planned') return 'border-2 border-aurora rounded-full'
  if (status === 'done') return 'bg-aurora rounded-full'
  if (status === 'skipped') return 'bg-ink-faint rounded-full'
  return 'bg-ink-faint rounded-full'
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
      <div
        v-for="session in todaySessions"
        :key="session.id"
        class="flex items-center gap-3"
        :data-testid="`session-${session.status}`"
      >
        <span :class="['w-2.5 h-2.5', statusClasses(session.status)]" />
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
