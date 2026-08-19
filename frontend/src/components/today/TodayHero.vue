<script setup lang="ts">
// facelift — el HERO de Hoy: absorbe RotationNextCard + TodaySessionCard en
// una sola pieza estilo referencia (foto/runa de fondo, "Hoy toca", nombre
// grande, CTA dominante). Estados, en orden:
//   (a) entreno en curso → eyebrow "Entrenando" + CTA continuar
//   (b) rutina de rotación ("te toca") con carrusel ‹ › para fijar otra
//       (putRotationNext, el mismo gesto de RotationPlanCard)
//   (c) nada → card compacta "Entreno libre"
// (v0.25.0: los estados de SESIÓN PLANIFICADA murieron con la feature; en
// modo atleta este componente no pinta nada)
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { ExerciseOut, RotationOut } from '@/api/domain'
import { getRotation, putRotationNext, routineImageUrl } from '@/api/domain'
import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkAnimatedText from '@/lib/BkAnimatedText.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkHero from '@/lib/BkHero.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAthleteStore } from '@/stores/athlete'
import { toastApiError } from '@/utils/apiErrors'
import { getViewCache, setViewCache } from '@/utils/viewCache'
import { estimateRoutineMinutes } from '@/components/workout/routineEstimate'

const props = withDefaults(defineProps<{ exercises: ExerciseOut[] }>(), { exercises: () => [] })

const { t } = useI18n()
const router = useRouter()
const athlete = useAthleteStore()
const activeWorkout = useActiveWorkoutStore()

const rotation = ref<RotationOut | null>(null)
const ready = ref(false)
// índice de la rutina MOSTRADA en el carrusel (arranca en la que toca)
const selectedIndex = ref<number | null>(null)
const switching = ref(false)

onMounted(async () => {
  if (athlete.isViewing) {
    ready.value = true
    return
  }
  // facelift v3: la rotación de la última visita pinta al instante; el GET
  // de siempre la refresca en fondo
  const cached = getViewCache<RotationOut>('today:rotation')
  if (cached) {
    rotation.value = cached
    selectedIndex.value = cached.next_position ?? null
    ready.value = true
  }
  try {
    rotation.value = (await getRotation()) ?? null
    selectedIndex.value = rotation.value?.next_position ?? null
    if (rotation.value) setViewCache('today:rotation', rotation.value)
  } catch {
    // hint de fondo: sin red, Hoy sigue con lo hidratado (o sin carrusel)
    if (!cached) rotation.value = null
  } finally {
    ready.value = true
  }
})

const routines = computed(() => rotation.value?.routines ?? [])
const displayRoutine = computed(() =>
  selectedIndex.value === null ? null : (routines.value[selectedIndex.value] ?? null),
)

const workoutActive = computed(() => activeWorkout.workout !== null)

// facelift v4 (zurdi: "que la imagen de hero de una rutina no sea la de un
// ejercicio"): SOLO la imagen propia de la rutina (subida en su editor);
// sin ella, manda la runa — nunca la foto de un ejercicio cualquiera
const heroSrc = computed(() =>
  displayRoutine.value?.has_image ? routineImageUrl(displayRoutine.value.id) : undefined,
)

const heroRune = computed<RuneName | null>(() =>
  displayRoutine.value?.rune && isValidRuneName(displayRoutine.value.rune)
    ? (displayRoutine.value.rune as RuneName)
    : null,
)

// v0.24.2 (zurdi: "el blur del min/ejercicios se resetea al cambiar de
// rutina + quiero los números rotatorios"): la píldora se queda MONTADA
// (nada de Transition out-in que desmonte el backdrop-blur) y los números
// ruedan con BkAnimatedNumber, como en el resto de la app
const heroMinutes = computed(() => {
  const routine = displayRoutine.value
  if (!routine || routine.exercises.length === 0) return null
  return estimateRoutineMinutes(routine, props.exercises)
})
const heroExerciseCount = computed(() => displayRoutine.value?.exercises.length ?? 0)

// ‹ ›: fijar otra rutina del plan como la de hoy — persiste al momento
// (putRotationNext); las flechas se deshabilitan mientras viaja el PUT para
// no encolar carreras
async function selectDelta(delta: number) {
  if (selectedIndex.value === null || routines.value.length < 2 || switching.value) return
  const next = (selectedIndex.value + delta + routines.value.length) % routines.value.length
  const target = routines.value[next]
  if (!target) return
  switching.value = true
  try {
    rotation.value = await putRotationNext(target.id)
    selectedIndex.value = rotation.value?.next_position ?? next
    if (rotation.value) setViewCache('today:rotation', rotation.value)
  } catch (error) {
    toastApiError(error)
  } finally {
    switching.value = false
  }
}

// con un entreno YA en curso no se arranca otro: el botón lleva a él.
// facelift fase 3: sin entreno en curso, el CTA navega a la pantalla de
// PRE-INICIO (workout-start) en vez de arrancar a ciegas — ahí vive el
// "Empezar entrenamiento" definitivo con los bloques a la vista
function start() {
  if (workoutActive.value) {
    router.push({ name: 'workout' })
    return
  }
  if (!displayRoutine.value) return
  router.push({ name: 'workout-start', params: { routineId: displayRoutine.value.id } })
}

function startFree() {
  router.push({ name: 'workout' })
}
</script>

<template>
  <!-- v0.25.0: en modo atleta no hay hero (la card de sesiones del día
       murió con la planificación) — Hoy muestra directamente el resto -->
  <template v-if="!athlete.isViewing && ready">
    <!-- facelift v3: la Transition externa solo cubre el cambio de RAMA
         (claves estáticas) — las flechas del carrusel ya NO remontan la
         card: animan solo el interior (título/meta con sus Transitions
         propias, y la media/runa dentro del propio BkHero) -->
    <Transition name="bk-pop-soft" mode="out-in">
    <!-- (b) hero de rotación — contenido redistribuido: eyebrow + título +
         meta arriba (con el padding del hero como margen del radio), la runa
         respira en el hueco central (spacer flex-1) y el CTA/chips/dots
         asientan abajo -->
    <BkHero
      v-if="displayRoutine"
      key="rot"
      :src="heroSrc"
      :rune="heroRune"
      data-testid="rotation-next-card"
    >
      <div class="flex-1 flex flex-col gap-3">
        <!-- v0.21.3 (zurdi: "las chevron ponlas justo en el medio de la card,
             alineadas verticalmente — a la altura del nombre quedaba todo muy
             junto"): las flechas dejan la fila del título y se anclan
             ABSOLUTAS al centro vertical de la card entera (el ancestro
             posicionado es el contenedor de contenido de BkHero, que cubre
             todo el hero), sobre el hueco central donde respira la runa -->
        <button
          v-if="routines.length > 1"
          type="button"
          class="bk-press absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border bk-hero-line flex items-center justify-center"
          :disabled="switching || undefined"
          :aria-label="t('today.heroPrev')"
          data-testid="hero-prev"
          @click="selectDelta(-1)"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          v-if="routines.length > 1"
          type="button"
          class="bk-press absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border bk-hero-line flex items-center justify-center"
          :disabled="switching || undefined"
          :aria-label="t('today.heroNext')"
          data-testid="hero-next"
          @click="selectDelta(1)"
        >
          <span aria-hidden="true">›</span>
        </button>
        <p class="bk-eyebrow bk-hero-accent">{{ workoutActive ? t('today.heroInProgress') : t('today.heroEyebrow') }}</p>
        <!-- v0.24.3 (zurdi): el título entra letra a letra al cambiar de
             rutina (BkAnimatedText) — la Transition out-in de antes muere -->
        <h2 class="min-w-0 bk-display truncate text-center" data-testid="rotation-next-name">
          <BkAnimatedText :text="displayRoutine.name" />
        </h2>
        <!-- v0.23.0 (zurdi): un pelín más grande (text-sm → text-base) y,
             sobre foto, con píldora scrim+blur detrás (ver .bk-hero-meta).
             v0.24.2: SIN Transition keyed — desmontar la píldora reseteaba
             el backdrop-blur un instante; ahora persiste y los números
             ruedan. OJO whitespace: todo en UNA línea — el condense del
             compilador se come los espacios con salto de línea entre nodos. -->
        <p v-if="heroMinutes !== null" class="text-center" data-testid="hero-meta">
          <span class="text-base bk-hero-muted bk-hero-meta">~<BkAnimatedNumber :value="heroMinutes" v-slot="{ value }">{{ value }}</BkAnimatedNumber> {{ t('today.heroMetaMin') }} · <BkAnimatedNumber :value="heroExerciseCount" v-slot="{ value }">{{ value }}</BkAnimatedNumber> {{ t('today.heroMetaExercises', heroExerciseCount) }}</span>
        </p>
        <!-- hueco central: aquí es donde la runa/foto se luce -->
        <div class="flex-1 min-h-10" aria-hidden="true" />
        <BkButton
          variant="primary"
          size="lg"
          block
          data-testid="rotation-start-btn"
          @click="start"
        >
          {{ workoutActive ? t('rotation.continue') : t('today.heroCta') }}
        </BkButton>
        <div v-if="routines.length > 1" class="flex items-center justify-center gap-1.5" aria-hidden="true">
          <span
            v-for="(routine, i) in routines"
            :key="routine.id"
            class="w-1.5 h-1.5 rounded-full"
            :class="i === selectedIndex ? 'bg-aurora' : 'bk-hero-dot'"
          />
        </div>
      </div>
    </BkHero>

    <!-- (c) sin plan: entreno libre a secas (v0.25.0: "programar" murió) -->
    <BkCard v-else key="empty" :title="t('today.todaySession')">
      <div class="space-y-3">
        <p class="text-ink-muted">{{ t('today.noSession') }}</p>
        <BkButton variant="primary" size="lg" block @click="startFree">
          {{ workoutActive ? t('rotation.continue') : t('today.heroFree') }}
        </BkButton>
      </div>
    </BkCard>
    </Transition>
  </template>
</template>
