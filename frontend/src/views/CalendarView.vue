<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { monthLabel } from '@/utils/dates'
import { getMonth, getHeatmap, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import BkHeatmap from '@/lib/BkHeatmap.vue'
import BkButton from '@/lib/BkButton.vue'
import BkSheet from '@/lib/BkSheet.vue'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import { useAthleteStore } from '@/stores/athlete'
import type { CalendarMonthOut, MuscleGroupOut } from '@/api/domain'

const athlete = useAthleteStore()

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1)

const locale = computed(() => athlete.viewing?.locale ?? 'es')
const label = computed(() => monthLabel(year.value, month.value, locale.value))

const monthData = ref<CalendarMonthOut>({ scheduled: [], workouts: [] })
const heatmapData = ref<{ date: string; count: number }[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const loading = ref(false)

const selectedDate = ref<string | null>(null)
const groupMap = computed(() => {
  const map = new Map<number, string>()
  for (const group of muscleGroups.value) {
    map.set(group.id, group.slug)
  }
  return map
})

async function loadMuscleGroups() {
  try {
    muscleGroups.value = await listMuscleGroups(athlete.userId)
  } catch (error) {
    toastApiError(error)
  }
}

async function loadMonth() {
  try {
    loading.value = true
    monthData.value = await getMonth(year.value, month.value, athlete.userId)
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

async function loadHeatmap() {
  try {
    heatmapData.value = await getHeatmap(year.value, athlete.userId)
  } catch (error) {
    toastApiError(error)
  }
}

function prevMonth() {
  if (month.value === 1) {
    year.value--
    month.value = 12
  } else {
    month.value--
  }
}

function nextMonth() {
  if (month.value === 12) {
    year.value++
    month.value = 1
  } else {
    month.value++
  }
}

function selectDay(date: string) {
  selectedDate.value = date
}

function closeScheduleSheet() {
  selectedDate.value = null
}

onMounted(() => {
  loadMuscleGroups()
})

watch([year, month], () => {
  loadMonth()
}, { immediate: true })

// heatmap solo se recarga si el año cambia
watch(year, () => {
  loadHeatmap()
}, { immediate: true })
</script>

<template>
  <div class="space-y-6 p-4">
    <!-- Header with month navigation -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-ink">{{ $t('app.nav.calendar') }}</h1>
    </div>

    <!-- Month navigation -->
    <div class="flex items-center justify-between">
      <BkButton variant="ghost" @click="prevMonth">
        ← {{ $t('calendar.prevMonth') }}
      </BkButton>
      <h2 class="text-lg font-semibold text-ink">{{ label }}</h2>
      <BkButton variant="ghost" @click="nextMonth">
        {{ $t('calendar.nextMonth') }} →
      </BkButton>
    </div>

    <!-- Month grid -->
    <MonthGrid
      :month="monthData"
      :year="year"
      :month-num="month"
      :group-map="groupMap"
      @select="selectDay"
    />

    <!-- Heatmap -->
    <div v-if="heatmapData.length > 0" class="mt-8">
      <h3 class="text-sm font-medium text-ink-muted mb-3">{{ $t('calendar.yearActivity') }}</h3>
      <BkHeatmap :data="heatmapData" :year="year" />
    </div>

    <!-- Schedule sheet modal -->
    <BkSheet :open="selectedDate !== null" :title="$t('calendar.scheduledSessions')" @close="closeScheduleSheet">
      <ScheduleSheet
        v-if="selectedDate"
        :date="selectedDate"
        :scheduled="monthData.scheduled.filter(s => s.date === selectedDate)"
        @updated="loadMonth"
      />
    </BkSheet>
  </div>
</template>
