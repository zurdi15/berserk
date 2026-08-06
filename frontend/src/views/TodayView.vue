<script setup lang="ts">
import { ref, watch } from 'vue'

import type { PersonalRecordOut, WorkoutOut, ScheduledOut, ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { getStreak, getMonth, listWorkouts, getRecords, listExercises, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { todayIso, getMondayOfWeek } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'
import StreakCard from '@/components/today/StreakCard.vue'
import TodaySessionCard from '@/components/today/TodaySessionCard.vue'
import WeekSummaryCard from '@/components/today/WeekSummaryCard.vue'
import RecentPrs from '@/components/today/RecentPrs.vue'

const athlete = useAthleteStore()

const streak = ref<{ weeks: number } | null>(null)
const schedules = ref<ScheduledOut[]>([])
const workouts = ref<WorkoutOut[]>([])
const records = ref<PersonalRecordOut[]>([])
const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])

async function load() {
  try {
    const today = todayIso()
    const monday = getMondayOfWeek()
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    // una sola ventana temporal (lunes a hoy) para evitar desajustes entre
    // datos de entrenamientos y distribución: todo se calcula cliente del mismo conjunto
    const [
      streakData,
      monthData,
      workoutsList,
      recordsList,
      exercisesList,
      muscleGroupsList,
    ] = await Promise.all([
      getStreak(athlete.userId),
      getMonth(year, month, athlete.userId),
      listWorkouts({ from_date: monday, to_date: today, userId: athlete.userId }),
      getRecords({ userId: athlete.userId }),
      listExercises({ userId: athlete.userId }),
      listMuscleGroups(athlete.userId),
    ])

    streak.value = streakData
    schedules.value = monthData.scheduled
    workouts.value = workoutsList
    records.value = recordsList
    exercises.value = exercisesList
    muscleGroups.value = muscleGroupsList
  } catch (error) {
    toastApiError(error)
  }
}

// recarga en el montaje y cada vez que cambia el atleta observado (empezar/dejar
// de ver a alguien): sin este watcher los datos de otro atleta quedaban
// pegados en pantalla tras pulsar "dejar de ver"
watch(() => athlete.userId, () => load(), { immediate: true })
</script>

<template>
  <div class="space-y-4 bk-stagger">
    <div :style="{ '--bk-stagger-i': 0 }">
      <StreakCard :streak="streak" />
    </div>
    <div :style="{ '--bk-stagger-i': 1 }">
      <TodaySessionCard :schedules="schedules" />
    </div>
    <div :style="{ '--bk-stagger-i': 2 }">
      <WeekSummaryCard :workouts="workouts" :exercises="exercises" :muscle-groups="muscleGroups" />
    </div>
    <div :style="{ '--bk-stagger-i': 3 }">
      <RecentPrs :records="records" :exercises="exercises" />
    </div>
  </div>
</template>
