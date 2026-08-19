<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PersonalRecordOut, WorkoutOut, ScheduledOut, ExerciseOut, MuscleGroupOut, DistributionItem } from '@/api/domain'
import { getStreak, getMonth, listWorkouts, getRecords, listExercises, listMuscleGroups, getDistribution } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { todayIso, getMondayOfWeek } from '@/utils/dates'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
import BkCard from '@/lib/BkCard.vue'
import StreakCard from '@/components/today/StreakCard.vue'
import TodayHero from '@/components/today/TodayHero.vue'
import WeekSummaryCard from '@/components/today/WeekSummaryCard.vue'
import DistributionBars from '@/components/today/DistributionBars.vue'
import RecentPrs from '@/components/today/RecentPrs.vue'
import SocialFeedCard from '@/components/today/SocialFeedCard.vue'

const { t, locale } = useI18n()
const athlete = useAthleteStore()
const auth = useAuthStore()

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

// facelift: saludo grande estilo referencia — con el propio nombre en vista
// propia, "Viendo a X" en modo atleta
const greeting = computed(() =>
  athlete.isViewing
    ? t('today.greetingViewing', { name: athlete.viewing?.username ?? '' })
    : t('today.greeting', { name: auth.user?.username ?? '' }),
)

const todayLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
)

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

// v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE — sin
// h-full ni overflow propio, Hoy scrollea contra <main> como toda la app.
// Sin chrome propio que pegar arriba (no hay cabecera ni tabs aquí), esta
// vista no necesita ningún sticky. El reset al entrar lo hace ShellView
// observando route.path.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes()
// en los tests, ver el mismo criterio en BkStepper.vue/ProgressView.vue.)
</script>

<template>
  <div v-if="ready" class="space-y-4 bk-stagger">
    <!-- facelift: saludo grande + fecha, con la racha degradada a chip al
         lado — el primer h1 real de la app -->
    <div :style="{ '--bk-stagger-i': 0 }" class="flex items-start justify-between gap-3 pt-1">
      <div class="min-w-0">
        <h1 class="bk-display text-ink">{{ greeting }}</h1>
        <p class="text-sm text-ink-muted capitalize">{{ todayLabel }}</p>
      </div>
      <StreakCard :streak="streak" />
    </div>
    <!-- v0.14.1 (zurdi): "te toca" ENCIMA de la programada — el hero abre
         con qué hacer AHORA y absorbe la sesión planificada como chip -->
    <div :style="{ '--bk-stagger-i': 1 }">
      <TodayHero :schedules="schedules" :exercises="exercises" />
    </div>
    <div v-if="!athlete.isViewing" :style="{ '--bk-stagger-i': 2 }">
      <SocialFeedCard />
    </div>
    <div :style="{ '--bk-stagger-i': 3 }">
      <WeekSummaryCard :workouts="workouts" :exercises="exercises" :muscle-groups="muscleGroups" />
    </div>
    <!-- item 4 (v0.4.2): Distribución muscular se muda aquí desde el panel de
         Récords (ProgressView) — su ventana de datos es fija a 4 semanas
         (getDistribution(4, ...), ver services/progress.py), un recorte de
         tiempo que encaja mejor en el contexto de Hoy que en un panel de
         récords históricos sin ventana. Va DIRECTAMENTE debajo de "Esta
         semana" (mismo bloque de ritmo reciente). Título vía BkCard con la
         key progress.distribution ya existente — se reusa, no se duplica -->
    <div :style="{ '--bk-stagger-i': 4 }">
      <BkCard :title="t('progress.distribution')">
        <DistributionBars :items="distribution" :groups="muscleGroups" />
      </BkCard>
    </div>
    <div :style="{ '--bk-stagger-i': 5 }">
      <RecentPrs :records="records" :exercises="exercises" />
    </div>
  </div>
</template>
