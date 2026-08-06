<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, RoutineOut } from '@/api/domain'
import { deleteRoutine, listExercises, listRoutines } from '@/api/domain'
import { isValidRuneName } from '@/lib/runeResolve'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { formatWeight } from '@/utils/units'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import type { RuneName } from '@/lib/runes'
import { exerciseName } from './exerciseName'
import RoutineEditorSheet from './RoutineEditorSheet.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()

const routines = ref<RoutineOut[]>([])
// catálogo de ejercicios: solo hace falta para resolver exercise_id → nombre
// al expandir una rutina (ver toggleExpanded); listRoutines() YA devuelve
// exercises completo por rutina (RoutineOut, no un resumen), así que no hace
// falta un fetch de detalle por rutina, solo este catálogo compartido
const exerciseCatalog = ref<ExerciseOut[]>([])
const editorOpen = ref(false)
const selectedRoutine = ref<RoutineOut | undefined>()
const deleteConfirming = ref<number | null>(null)
// qué rutinas tienen su lista de ejercicios expandida (side-quest 1 follow-up)
const expandedIds = ref<Set<number>>(new Set())
// gatea lista/vacío hasta que la carga resuelve: sin esto la lista entra
// vacía (BkEmpty) y ~100ms después las rutinas aparecen de golpe encima —
// mismo patrón que TodayView. true también en error, para no dejar la
// sección en blanco si la carga falla.
const ready = ref(false)

const units = computed(() => (auth.user?.units as 'kg' | 'lb') || 'kg')

function resolveExercise(exerciseId: number): ExerciseOut | undefined {
  return exerciseCatalog.value.find((exercise) => exercise.id === exerciseId)
}

function toggleExpanded(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

async function loadRoutines() {
  try {
    // en paralelo: el catálogo no depende de las rutinas y viceversa
    const [routinesResult, exercisesResult] = await Promise.all([listRoutines(), listExercises({})])
    routines.value = routinesResult
    exerciseCatalog.value = exercisesResult
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

function openEditor(routine?: RoutineOut) {
  selectedRoutine.value = routine
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  selectedRoutine.value = undefined
  loadRoutines()
}

async function confirmDelete(id: number) {
  try {
    await deleteRoutine(id)
    await loadRoutines()
    deleteConfirming.value = null
  } catch (error) {
    toastApiError(error)
  }
}

onMounted(() => {
  loadRoutines()
})
</script>

<template>
  <div class="space-y-4">
    <!-- item 7: sin título "Rutinas" (la pestaña de Perfil ya lo dice) — el
         botón de crear queda solo, pegado al borde izquierdo de esta fila -->
    <div class="flex items-center">
      <BkButton
        variant="primary"
        size="sm"
        data-testid="new-routine-btn"
        @click="openEditor()"
      >
        {{ $t('routines.newRoutine') }}
      </BkButton>
    </div>

    <!-- Routines List: gateada en ready para no mostrar el vacío y luego
         reemplazarlo de golpe por la lista real -->
    <div v-if="ready && routines.length > 0" class="grid gap-3">
      <div
        v-for="routine in routines"
        :key="routine.id"
        class="p-4 border border-line rounded-sm bg-stone space-y-3"
      >
        <!-- Fila: info a la izquierda (flex-1 min-w-0, trunca si hace
             falta), acciones a la derecha (shrink-0) — mismo criterio que
             la celda de acciones de AdminCard, en vez de las acciones
             colgando debajo del contenido. La zona de info es un <button>
             real (toggle de expansión, side-quest 1 follow-up): las acciones
             quedan FUERA de él como hermano, para que editar/borrar no
             disparen también el expand/collapse (ni un <button> anidado
             dentro de otro, que sería HTML inválido). -->
        <div class="flex items-start gap-3">
          <button
            type="button"
            class="bk-press flex flex-1 min-w-0 items-start gap-3 text-left"
            :aria-expanded="expandedIds.has(routine.id) ? 'true' : 'false'"
            :data-testid="`toggle-routine-${routine.id}`"
            @click="toggleExpanded(routine.id)"
          >
            <div v-if="routine.rune && isValidRuneName(routine.rune)" class="text-ink shrink-0">
              <BkRune :name="(routine.rune as RuneName)" :size="32" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-ink truncate">{{ routine.name }}</h3>
              <p v-if="routine.description" class="text-sm text-ink-muted truncate">{{ routine.description }}</p>
              <p class="text-sm text-ink-muted mt-1">{{ routine.exercises.length }} {{ t('routines.exercises') }}</p>
            </div>
          </button>
          <div class="flex items-center gap-2 shrink-0">
            <BkActionBtn
              icon="edit"
              :data-testid="`edit-routine-${routine.id}`"
              :aria-label="$t('common.edit')"
              @click="openEditor(routine)"
            />
            <BkActionBtn
              v-if="deleteConfirming !== routine.id"
              icon="delete"
              :data-testid="`delete-routine-${routine.id}`"
              :aria-label="$t('common.delete')"
              @click="deleteConfirming = routine.id"
            />
          </div>
        </div>

        <!-- Lista de ejercicios de la rutina, solo lectura: entra con
             bk-stagger (sistema único de animación de entrada) al expandir;
             el colapso es instantáneo, sin animación de salida -->
        <div
          v-if="expandedIds.has(routine.id)"
          :data-testid="`exercise-list-${routine.id}`"
          class="space-y-2 border-t border-line pt-3 bk-stagger"
        >
          <div
            v-for="(ex, i) in routine.exercises"
            :key="ex.id"
            :style="{ '--bk-stagger-i': i }"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="text-ink truncate">{{ exerciseName(resolveExercise(ex.exercise_id), locale) }}</span>
            <span class="text-ink-muted shrink-0 text-right">
              {{ ex.target_sets }}×{{ ex.target_reps ?? '–' }}
              <template v-if="ex.target_weight_kg != null"> · {{ formatWeight(ex.target_weight_kg, units) }}</template>
              <template v-if="ex.rest_seconds"> · {{ ex.rest_seconds }}s</template>
            </span>
          </div>
          <p v-if="!routine.exercises.length" class="text-sm text-ink-faint">
            {{ t('routines.noExercisesInRoutine') }}
          </p>
        </div>

        <!-- Confirmar borrado: fila completa debajo del contenido, no
             encajada junto al nombre — en 390px, "Confirmar"/"Cancelar"
             dejan solo ~95px para la columna del nombre (frente a ~200px
             con los dos iconos normales), demasiado apretado con truncate -->
        <div v-if="deleteConfirming === routine.id" class="flex gap-2">
          <BkButton
            variant="danger"
            size="sm"
            class="flex-1"
            @click="confirmDelete(routine.id)"
          >
            {{ $t('routines.confirm') }}
          </BkButton>
          <BkButton
            variant="ghost"
            size="sm"
            class="flex-1"
            @click="deleteConfirming = null"
          >
            {{ $t('common.cancel') }}
          </BkButton>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <BkEmpty v-else-if="ready" :message="$t('routines.noRoutines')" />

    <!-- Editor Sheet -->
    <RoutineEditorSheet
      :open="editorOpen"
      :routine="selectedRoutine"
      @close="closeEditor"
    />
  </div>
</template>
