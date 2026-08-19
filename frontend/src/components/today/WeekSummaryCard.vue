<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuneName } from '@/lib/runes'
import type { WorkoutOut, ExerciseOut, MuscleGroupOut } from '@/api/domain'

import { useAnimatedNumber } from '@/composables/useAnimatedNumber'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import BkTooltip from '@/lib/BkTooltip.vue'
import { getMondayOfWeek, todayIso } from '@/utils/dates'

const props = withDefaults(
  defineProps<{
    workouts: WorkoutOut[]
    exercises: ExerciseOut[]
    muscleGroups: MuscleGroupOut[]
  }>(),
  {
    workouts: () => [],
    exercises: () => [],
    muscleGroups: () => [],
  },
)

const { locale, t } = useI18n()

const validRunes = new Set<string>(['chest', 'back', 'biceps', 'triceps', 'shoulders', 'legs', 'core'])

// item 3 (v0.3.0): nombre localizado del grupo para el tooltip de la runa —
// mismo criterio que la leyenda de runas del calendario (CalendarView.vue):
// el idioma de la UI (viewer), no el del atleta
function muscleGroupName(mg: MuscleGroupOut): string {
  return locale.value === 'es' ? mg.name_es : mg.name_en
}

const workoutDays = computed(() => {
  const uniqueDates = new Set(props.workouts.map((w) => w.date))
  return uniqueDates.size
})

// calcular series efectivas (no-warmup) desde los entrenamientos ya obtenidos,
// una única ventana temporal para precisión
const effectiveSets = computed(() => {
  let total = 0
  for (const workout of props.workouts) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (!set.is_warmup) {
          total += 1
        }
      }
    }
  }
  return total
})

// derivar grupos musculares de muscle_tag_ids + grupos primarios de ejercicios del entrenamiento
const muscleGroupsInWeek = computed(() => {
  const muscleGroupMap = new Map(props.muscleGroups.map((mg) => [mg.id, mg]))
  const exerciseMap = new Map(props.exercises.map((e) => [e.id, e]))
  const seenMuscleGroupIds = new Set<number>()

  // recolectar de muscle_tag_ids explícitos en entrenamientos
  for (const workout of props.workouts) {
    for (const mgId of workout.muscle_tag_ids) {
      seenMuscleGroupIds.add(mgId)
    }
  }

  // recolectar grupos primarios de ejercicios
  for (const workout of props.workouts) {
    for (const exercise of workout.exercises) {
      const ex = exerciseMap.get(exercise.exercise_id)
      if (ex) {
        for (const link of ex.muscle_groups) {
          if (link.is_primary) {
            seenMuscleGroupIds.add(link.muscle_group_id)
          }
        }
      }
    }
  }

  const result: MuscleGroupOut[] = []
  for (const mgId of seenMuscleGroupIds) {
    const mg = muscleGroupMap.get(mgId)
    if (mg && validRunes.has(mg.slug)) {
      result.push(mg)
    }
  }
  return result
})

const animatedWorkoutDays = useAnimatedNumber(() => workoutDays.value)
const animatedEffectiveSets = useAnimatedNumber(() => effectiveSets.value)

// facelift: fila de 7 puntos (lunes→domingo) estilo referencia — un punto
// lleno por día CON entreno; los días futuros van atenuados. Fechas locales
// a mano (no Date.toISOString: eso pasa por UTC y desplaza el día en según
// qué huso, ver utils/dates).
const trainedDates = computed(() => new Set(props.workouts.map((w) => w.date)))
const weekDots = computed(() => {
  const monday = getMondayOfWeek()
  const [y, m, d] = monday.split('-').map(Number)
  const today = todayIso()
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return {
      iso,
      label: new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(date),
      trained: trainedDates.value.has(iso),
      future: iso > today,
      isToday: iso === today,
    }
  })
})
</script>

<template>
  <BkCard :title="$t('today.weekSummary')">
    <div class="space-y-4">
      <!-- facelift: fila de 7 puntos de la semana (estilo referencia) -->
      <div class="flex justify-between gap-1" :aria-label="t('today.weekDots')" data-testid="week-dots">
        <div v-for="dot in weekDots" :key="dot.iso" class="flex flex-col items-center gap-1.5 flex-1">
          <span class="text-2xs uppercase" :class="dot.isToday ? 'text-ink font-semibold' : 'text-ink-faint'">{{ dot.label }}</span>
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="dot.trained ? 'bg-aurora' : dot.future ? 'bg-line/50' : 'bg-line-strong'"
          />
        </div>
      </div>
      <!-- facelift: tiles grandes en vez de dos líneas pequeñas -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-md bg-slab p-3">
          <p class="text-sm text-ink-muted">{{ $t('today.workoutDays') }}</p>
          <p class="bk-metric text-3xl text-ink">{{ animatedWorkoutDays ?? 0 }}</p>
        </div>
        <div class="rounded-md bg-slab p-3">
          <p class="text-sm text-ink-muted">{{ $t('today.effectiveSets') }}</p>
          <p class="bk-metric text-3xl text-ink">{{ animatedEffectiveSets ?? 0 }}</p>
        </div>
      </div>

      <div v-if="muscleGroupsInWeek.length > 0" class="pt-2 border-t border-line">
        <p class="text-ink-muted text-sm mb-2">{{ $t('today.muscleGroupsTouched') }}</p>
        <div class="flex flex-wrap gap-2">
          <!-- item 3 (v0.3.0): tap/click o foco+Enter revela el nombre del
               grupo — las runas no se autoexplican fuera del contexto del
               catálogo (mismo problema que ya resolvió la leyenda del
               calendario, aquí a nivel de icono individual en vez de sheet) -->
          <BkTooltip
            v-for="mg in muscleGroupsInWeek"
            :key="mg.id"
            :text="muscleGroupName(mg)"
          >
            <BkRune :name="(mg.slug as RuneName)" :size="24" />
          </BkTooltip>
        </div>
      </div>
    </div>
  </BkCard>
</template>
