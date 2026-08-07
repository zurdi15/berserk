<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PersonalRecordOut, WorkoutOut, ScheduledOut, ExerciseOut, MuscleGroupOut, DistributionItem } from '@/api/domain'
import { getStreak, getMonth, listWorkouts, getRecords, listExercises, listMuscleGroups, getDistribution } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { todayIso, getMondayOfWeek } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'
import BkCard from '@/lib/BkCard.vue'
import StreakCard from '@/components/today/StreakCard.vue'
import TodaySessionCard from '@/components/today/TodaySessionCard.vue'
import WeekSummaryCard from '@/components/today/WeekSummaryCard.vue'
import DistributionBars from '@/components/today/DistributionBars.vue'
import RecentPrs from '@/components/today/RecentPrs.vue'

const { t } = useI18n()
const athlete = useAthleteStore()

const streak = ref<{ weeks: number } | null>(null)
const schedules = ref<ScheduledOut[]>([])
const workouts = ref<WorkoutOut[]>([])
const records = ref<PersonalRecordOut[]>([])
const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
// item 4 (v0.4.2): distribución muscular, mudada aquí desde el panel de
// Récords — ver comentario largo del bloque en el template más abajo
const distribution = ref<DistributionItem[]>([])
// gatea el montaje de las cards a datos ya resueltos: sin esto, las cards
// entran con el estado vacío (streak 0, tono ink) y ~100ms después load()
// las repinta de golpe — un doble-render visible. Con v-if="ready" solo
// entran una vez con su color/valor final, y el roll de useAnimatedNumber
// arranca ya sobre ese valor. true también en error (finally) para no dejar
// la vista en blanco si la carga falla.
const ready = ref(false)

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
      distributionData,
    ] = await Promise.all([
      getStreak(athlete.userId),
      getMonth(year, month, athlete.userId),
      listWorkouts({ from_date: monday, to_date: today, userId: athlete.userId }),
      getRecords({ userId: athlete.userId }),
      listExercises({ userId: athlete.userId }),
      listMuscleGroups(athlete.userId),
      // item 4 (v0.4.2): mismo hilo de atleta y mismo Promise.all que el
      // resto de esta vista, gateado por el ready de más abajo como todo lo demás
      getDistribution(4, athlete.userId),
    ])

    streak.value = streakData
    schedules.value = monthData.scheduled
    workouts.value = workoutsList
    records.value = recordsList
    exercises.value = exercisesList
    muscleGroups.value = muscleGroupsList
    distribution.value = distributionData
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

// recarga en el montaje y cada vez que cambia el atleta observado (empezar/dejar
// de ver a alguien): sin este watcher los datos de otro atleta quedaban
// pegados en pantalla tras pulsar "dejar de ver"
watch(() => athlete.userId, () => load(), { immediate: true })

// item 14 (v0.4.3, zurdi generaliza el modelo de scroll interno a TODAS las
// vistas, no solo Perfil/Progresión): la raíz del template lleva h-full
// (referencia de altura ya provista por el wrapper del shell, ver
// ShellView.vue) + overflow-y-auto — Hoy no tiene chrome fijo que anclar
// arriba (sin cabecera propia, a diferencia de Calendario), así que la raíz
// entera ES el único contenedor de scroll: sin esto, una Hoy con mucho
// registro empujaba el scroll a <main> (borde real de la ventana); ahora
// scrollea DENTRO de su propia caja, terminando por encima del navbar vía
// el spacer del wrapper (item 4: el reset de scroll al cambiar de ruta
// llega gratis — RouterView remonta la vista entera, y un contenedor de
// scroll recién creado arranca en 0).
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes()
// en los tests, ver el mismo criterio en BkStepper.vue/ProgressView.vue.)
</script>

<template>
  <div v-if="ready" class="h-full overflow-y-auto space-y-4 bk-stagger">
    <div :style="{ '--bk-stagger-i': 0 }">
      <StreakCard :streak="streak" />
    </div>
    <div :style="{ '--bk-stagger-i': 1 }">
      <TodaySessionCard :schedules="schedules" />
    </div>
    <div :style="{ '--bk-stagger-i': 2 }">
      <WeekSummaryCard :workouts="workouts" :exercises="exercises" :muscle-groups="muscleGroups" />
    </div>
    <!-- item 4 (v0.4.2): Distribución muscular se muda aquí desde el panel de
         Récords (ProgressView) — su ventana de datos es fija a 4 semanas
         (getDistribution(4, ...), ver services/progress.py), un recorte de
         tiempo que encaja mejor en el contexto de Hoy que en un panel de
         récords históricos sin ventana. Va DIRECTAMENTE debajo de "Esta
         semana" (mismo bloque de ritmo reciente). Título vía BkCard con la
         key progress.distribution ya existente — se reusa, no se duplica -->
    <div :style="{ '--bk-stagger-i': 3 }">
      <BkCard :title="t('progress.distribution')">
        <DistributionBars :items="distribution" :groups="muscleGroups" />
      </BkCard>
    </div>
    <div :style="{ '--bk-stagger-i': 4 }">
      <RecentPrs :records="records" :exercises="exercises" />
    </div>
  </div>
</template>
