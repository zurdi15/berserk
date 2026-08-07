<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, RoutineOut } from '@/api/domain'
import {
  copyRoutine,
  deleteRoutine,
  globalizeRoutine,
  listExercises,
  listRoutineTemplates,
  listRoutines,
  updateRoutine,
} from '@/api/domain'
import { isValidRuneName } from '@/lib/runeResolve'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { formatWeight } from '@/utils/units'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkSheet from '@/lib/BkSheet.vue'
import type { RuneName } from '@/lib/runes'
import { exerciseName } from './exerciseName'
import RoutineEditorSheet from './RoutineEditorSheet.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const routines = ref<RoutineOut[]>([])
// W2 feature 2: plantillas visibles (globales + públicas de OTROS) para la
// sección "Plantillas" — las propias YA salen arriba, en `routines`
const templates = ref<RoutineOut[]>([])
// catálogo de ejercicios: solo hace falta para resolver exercise_id → nombre
// al expandir una rutina (ver toggleExpanded); listRoutines() YA devuelve
// exercises completo por rutina (RoutineOut, no un resumen), así que no hace
// falta un fetch de detalle por rutina, solo este catálogo compartido
const exerciseCatalog = ref<ExerciseOut[]>([])
const editorOpen = ref(false)
const selectedRoutine = ref<RoutineOut | undefined>()
const deleteConfirming = ref<number | null>(null)
// W2 feature 2: confirm sheet del control admin-only "convertir en global"
// (segunda acción, distinta del borrado) — ver globalize()
const globalizeConfirmId = ref<number | null>(null)
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
    // en paralelo: ninguna de las tres depende de las otras
    const [routinesResult, templatesResult, exercisesResult] = await Promise.all([
      listRoutines(),
      listRoutineTemplates(),
      listExercises({}),
    ])
    routines.value = routinesResult
    templates.value = templatesResult
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

// W2 feature 2: toggle "Visible para todos" en la propia tarjeta — el
// editor de rutinas está fuera de este carril, así que vive aquí en vez de
// en RoutineEditorSheet
async function togglePublic(routine: RoutineOut) {
  try {
    await updateRoutine(routine.id, { is_public: !routine.is_public })
    await loadRoutines()
  } catch (error) {
    toastApiError(error)
  }
}

async function copyTemplate(id: number) {
  try {
    await copyRoutine(id)
    await loadRoutines()
    toast.push('info', t('routines.copied'))
  } catch (error) {
    toastApiError(error)
  }
}

async function globalize(id: number) {
  globalizeConfirmId.value = null
  try {
    await globalizeRoutine(id)
    await loadRoutines()
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
         botón de crear queda solo, pegado al borde izquierdo de esta fila.
         item 10: en vacío el botón se muda DENTRO del BkEmpty de abajo, así
         que esta fila solo vive antes de listo (evita el flash "sin botón")
         o cuando SÍ hay rutinas — nunca los dos botones a la vez. -->
    <div v-if="!ready || routines.length > 0" class="flex items-center">
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

        <!-- W2 feature 2: toggle "Visible para todos" (PATCH-able desde la
             propia tarjeta — el editor de rutinas está fuera de este
             carril) + segundo control admin-only para "globalizar". Mismo
             estilo de chip que GroupRunePicker (border-aurora/bg-aurora/10
             cuando está activo), sin clases de color interpoladas. -->
        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            class="bk-press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all"
            :class="routine.is_public
              ? 'border-aurora bg-aurora/10 text-aurora'
              : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'"
            :aria-pressed="routine.is_public ? 'true' : 'false'"
            :aria-label="$t('routines.isPublic')"
            :data-testid="`toggle-public-routine-${routine.id}`"
            @click="togglePublic(routine)"
          >
            {{ $t('routines.isPublic') }}
          </button>
          <button
            v-if="auth.user?.is_admin"
            type="button"
            class="bk-press inline-flex items-center rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink transition-all"
            :aria-label="$t('routines.globalize')"
            :data-testid="`globalize-routine-${routine.id}`"
            @click="globalizeConfirmId = routine.id"
          >
            {{ $t('routines.globalize') }}
          </button>
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
              <!-- item 9: sin en-dash de relleno cuando no hay reps objetivo
                   (p.ej. ejercicios por tiempo) — se omite el ×reps entero -->
              {{ ex.target_sets }}<template v-if="ex.target_reps != null">×{{ ex.target_reps }}</template>
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
             con los dos iconos normales), demasiado apretado con truncate.
             item 7: pop-in al aparecer (mismo idiom que el resto del carril,
             ver BodySection) — solo entrada, como el resto del sistema. -->
        <Transition name="bk-pop-soft" mode="out-in">
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
        </Transition>
      </div>
    </div>

    <!-- Empty State: item 10, el botón de crear se muda aquí dentro -->
    <BkEmpty
      v-else-if="ready"
      :message="$t('routines.noRoutines')"
      :action-label="$t('routines.newRoutine')"
      action-testid="new-routine-btn"
      @action="openEditor()"
    />

    <!-- W2 feature 2: sección "Plantillas" — globales (admin) + públicas de
         otros usuarios, de solo lectura salvo la acción de copiar. Debajo
         del listado propio, siempre visible (no colapsable, a diferencia
         del catálogo de ExerciseManager: pocas plantillas esperadas). -->
    <BkCard v-if="ready" :title="$t('routines.templates')" data-testid="templates-section">
      <div v-if="templates.length > 0" class="grid gap-3">
        <div
          v-for="template in templates"
          :key="template.id"
          class="p-4 border border-line rounded-sm bg-stone space-y-3"
        >
          <div class="flex items-start gap-3">
            <button
              type="button"
              class="bk-press flex flex-1 min-w-0 items-start gap-3 text-left"
              :aria-expanded="expandedIds.has(template.id) ? 'true' : 'false'"
              :data-testid="`toggle-template-${template.id}`"
              @click="toggleExpanded(template.id)"
            >
              <div v-if="template.rune && isValidRuneName(template.rune)" class="text-ink shrink-0">
                <BkRune :name="(template.rune as RuneName)" :size="32" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-ink truncate">{{ template.name }}</h3>
                <p v-if="template.description" class="text-sm text-ink-muted truncate">{{ template.description }}</p>
                <p class="text-sm text-ink-muted mt-1">{{ template.exercises.length }} {{ t('routines.exercises') }}</p>
                <!-- atribución: username del dueño, o "Global" si es una
                     plantilla de admin (owner_id null, ver globalize()) -->
                <p class="text-xs text-ink-faint mt-1" :data-testid="`template-attribution-${template.id}`">
                  <template v-if="template.owner_username">{{ $t('common.sharedBy', { username: template.owner_username }) }}</template>
                  <template v-else>{{ $t('routines.globalTemplate') }}</template>
                </p>
              </div>
            </button>
            <div class="flex items-center gap-2 shrink-0">
              <BkActionBtn
                icon="copy"
                :data-testid="`copy-template-${template.id}`"
                :aria-label="$t('routines.copy')"
                @click="copyTemplate(template.id)"
              />
            </div>
          </div>

          <div
            v-if="expandedIds.has(template.id)"
            :data-testid="`exercise-list-template-${template.id}`"
            class="space-y-2 border-t border-line pt-3 bk-stagger"
          >
            <div
              v-for="(ex, i) in template.exercises"
              :key="ex.id"
              :style="{ '--bk-stagger-i': i }"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <span class="text-ink truncate">{{ exerciseName(resolveExercise(ex.exercise_id), locale) }}</span>
              <span class="text-ink-muted shrink-0 text-right">
                {{ ex.target_sets }}<template v-if="ex.target_reps != null">×{{ ex.target_reps }}</template>
                <template v-if="ex.target_weight_kg != null"> · {{ formatWeight(ex.target_weight_kg, units) }}</template>
                <template v-if="ex.rest_seconds"> · {{ ex.rest_seconds }}s</template>
              </span>
            </div>
            <p v-if="!template.exercises.length" class="text-sm text-ink-faint">
              {{ t('routines.noExercisesInRoutine') }}
            </p>
          </div>
        </div>
      </div>
      <BkEmpty v-else :message="$t('routines.noTemplates')" />
    </BkCard>

    <!-- W2 feature 2: confirm sheet del control admin-only "convertir en
         global" — mismo patrón que el sheet de borrado de ExerciseManager -->
    <BkSheet
      :open="globalizeConfirmId !== null"
      :title="$t('routines.confirmGlobalize')"
      @close="globalizeConfirmId = null"
    >
      <div class="space-y-4 p-4" data-testid="globalize-confirm-sheet">
        <p>{{ $t('routines.confirmGlobalizeMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            data-testid="globalize-cancel-btn"
            @click="globalizeConfirmId = null"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="primary"
            data-testid="globalize-confirm-btn"
            @click="globalize(globalizeConfirmId!)"
          >
            {{ $t('routines.confirm') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Editor Sheet -->
    <RoutineEditorSheet
      :open="editorOpen"
      :routine="selectedRoutine"
      @close="closeEditor"
    />
  </div>
</template>
