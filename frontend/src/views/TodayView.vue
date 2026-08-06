<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { getStreak, getMonth, getDistribution, listWorkouts, getRecords, listExercises, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { todayIso, getMondayOfWeek } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'
import StreakCard from '@/components/today/StreakCard.vue'
import TodaySessionCard from '@/components/today/TodaySessionCard.vue'
import WeekSummaryCard from '@/components/today/WeekSummaryCard.vue'
import RecentPrs from '@/components/today/RecentPrs.vue'

const { t } = useI18n()
const athlete = useAthleteStore()

const streak = ref<{ weeks: number } | null>(null)
const schedules = ref<any[]>([])
const workouts = ref<any[]>([])
const distribution = ref<any[]>([])
const records = ref<any[]>([])
const exercises = ref<any[]>([])
const muscleGroups = ref<any[]>([])

async function load() {
  try {
    const today = todayIso()
    const monday = getMondayOfWeek()
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    const [
      streakData,
      monthData,
      distributionData,
      workoutsList,
      recordsList,
      exercisesList,
      muscleGroupsList,
    ] = await Promise.all([
      getStreak(athlete.userId),
      getMonth(year, month, athlete.userId),
      getDistribution(1, athlete.userId),
      listWorkouts({ from_date: monday, to_date: today, userId: athlete.userId }),
      getRecords({ userId: athlete.userId }),
      listExercises({ userId: athlete.userId }),
      listMuscleGroups(athlete.userId),
    ])

    streak.value = streakData
    schedules.value = monthData.scheduled
    workouts.value = workoutsList
    distribution.value = distributionData
    records.value = recordsList
    exercises.value = exercisesList
    muscleGroups.value = muscleGroupsList
  } catch (error) {
    toastApiError(error)
  }
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-4 bk-stagger">
    <StreakCard :streak="streak" />
    <TodaySessionCard :schedules="schedules" :exercises="exercises" :muscle-groups="muscleGroups" />
    <WeekSummaryCard :workouts="workouts" :distribution="distribution" :muscle-groups="muscleGroups" />
    <RecentPrs :records="records" :exercises="exercises" />
  </div>
</template>
