<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, RoutineOut } from '@/api/domain'
import {
  copyRoutine,
  deleteRoutine,
  listExercises,
  listRoutineTemplates,
  listRoutines,
  routineImageUrl,
} from '@/api/domain'
import { isValidRuneName } from '@/lib/runeResolve'
import RotationPlanCard from './RotationPlanCard.vue'
import { toastApiError } from '@/utils/apiErrors'
import { getViewCache, setViewCache } from '@/utils/viewCache'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { formatWeight } from '@/utils/units'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkMedia from '@/lib/BkMedia.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkUser from '@/lib/BkUser.vue'
import type { RuneName } from '@/lib/runes'
import { exerciseName } from './exerciseName'
import RoutineEditorSheet from './RoutineEditorSheet.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const routines = ref<RoutineOut[]>([])
// mías + plantillas globales/públicas de otros, fusionadas en displayRoutines
// (ver más abajo) para UNA sola lista — ya no dos secciones separadas
const templates = ref<RoutineOut[]>([])
// catálogo de ejercicios: solo hace falta para resolver exercise_id → nombre
// al expandir una rutina (ver toggleExpanded); listRoutines() YA devuelve
// exercises completo por rutina (RoutineOut, no un resumen), así que no hace
// falta un fetch de detalle por rutina, solo este catálogo compartido
const exerciseCatalog = ref<ExerciseOut[]>([])
const editorOpen = ref(false)
const selectedRoutine = ref<RoutineOut | undefined>()
const deleteConfirming = ref<number | null>(null)
// qué rutinas tienen su lista de ejercicios expandida (compartido entre
// mías y plantillas: los ids nunca colisionan, list_templates excluye lo mío)
const expandedIds = ref<Set<number>>(new Set())
// gatea lista/vacío hasta que la carga resuelve: sin esto la lista entra
// vacía (BkEmpty) y ~100ms después las rutinas aparecen de golpe encima —
// mismo patrón que TodayView. true también en error, para no dejar la
// sección en blanco si la carga falla.
const ready = ref(false)

const units = computed(() => (auth.user?.units as 'kg' | 'lb') || 'kg')

// UNIFIED-LISTINGS: zurdi no quiere "una sección de rutinas y otra de
// plantillas" — una única lista, con una label de quién la creó cuando no es
// mía. Orden: mías primero, luego globales, luego de otros usuarios (dentro
// de cada bloque, alfabético) — cada bucket llega YA ordenado por nombre
// desde el backend (list_routines/list_templates hacen .order_by(Routine.name)),
// así que basta con filtrar en buckets sin reordenar de nuevo.
type RoutineKind = 'own' | 'global' | 'other'
interface DisplayRoutine extends RoutineOut {
  kind: RoutineKind
}

const displayRoutines = computed<DisplayRoutine[]>(() => [
  ...routines.value.map((r): DisplayRoutine => ({ ...r, kind: 'own' })),
  ...templates.value
    .filter((tpl) => tpl.owner_id == null)
    .map((tpl): DisplayRoutine => ({ ...tpl, kind: 'global' })),
  ...templates.value
    .filter((tpl) => tpl.owner_id != null)
    .map((tpl): DisplayRoutine => ({ ...tpl, kind: 'other' })),
])

function resolveExercise(exerciseId: number): ExerciseOut | undefined {
  return exerciseCatalog.value.find((exercise) => exercise.id === exerciseId)
}

// item 2 (v0.4.0 — root cause del bug de visibilidad): una rutina GLOBAL
// puede referenciar un ejercicio que su dueño NUNCA marcó is_public — la
// rutina en sí es visible (list_templates solo mira Routine.is_global), pero
// ese ejercicio en concreto no aparece en MI catálogo visible (listExercises
// solo trae lo mío + lo global + lo público). Antes exerciseName() devolvía
// '' en silencio para un ExerciseOut undefined y la fila salía completamente
// en blanco — indistinguible de un fallo real ("no veo los ejercicios").
// Ahora se explicita con un placeholder: sigue sin filtrar el nombre real
// (eso sería la fuga de privacidad que _visible_template evita a propósito),
// pero deja claro POR QUÉ esa fila no tiene nombre. UNIFIED-LISTINGS: se usa
// para TODAS las filas (antes solo plantillas) — mismo helper, una lista.
function resolvedExerciseName(exerciseId: number, loc: string): string {
  const exercise = resolveExercise(exerciseId)
  return exercise ? exerciseName(exercise, loc) : t('routines.privateExercise')
}

function toggleExpanded(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

async function loadRoutines() {
  // facelift v3: hidratar la última carga al instante y refrescar en fondo
  type Snapshot = { routines: RoutineOut[]; templates: RoutineOut[]; catalog: ExerciseOut[] }
  const cached = getViewCache<Snapshot>('routines:list')
  if (cached) {
    routines.value = cached.routines
    templates.value = cached.templates
    exerciseCatalog.value = cached.catalog
    ready.value = true
  }
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
    setViewCache<Snapshot>('routines:list', {
      routines: routinesResult,
      templates: templatesResult,
      catalog: exercisesResult,
    })
  } catch (error) {
    if (!cached) toastApiError(error)
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

// ROUTINES-OPEN: "Duplicar" — el check "Global" que controla is_global vive
// ahora en el editor (RoutineEditorSheet), fuera de esta card. Duplicar
// aplica a CUALQUIER rutina visible, incluidas las propias (variante rápida
// de una tuya), no solo a las globales de otros.
async function duplicateRoutine(id: number) {
  try {
    await copyRoutine(id)
    await loadRoutines()
    toast.push('info', t('routines.duplicated'))
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
    <!-- v0.14.0: plan rotatorio — editor encima de la lista de rutinas;
         las candidatas son las mismas que esta lista ya conoce -->
    <RotationPlanCard v-if="ready" :available="displayRoutines" />

    <!-- v0.23.1 (zurdi): "Nueva rutina" entre el plan rotatorio y la lista,
         alineado a la DERECHA. Nunca en el estado vacío: el botón de
         BkEmpty ya lo cubre, evita el duplicado. -->
    <div v-if="!ready || displayRoutines.length > 0" class="flex justify-end">
      <BkButton
        variant="primary"
        size="sm"
        data-testid="new-routine-btn"
        @click="openEditor()"
      >
        {{ $t('routines.newRoutine') }}
      </BkButton>
    </div>

    <!-- item 2/3 (v0.4.3, zurdi): esqueleto (shimmer) mientras carga, mismo
         hueco que las cards reales — antes esto era un gate a blanco
         (v-if="ready") que hacía saltar el layout al llegar los datos
         (Biblioteca/Admin tenían el mismo problema, ver esos componentes).
         Filas aprox. del mismo alto que una card real (rune 32px + 2 líneas
         de texto), mismo idiom bk-shimmer que ExercisePicker. -->
    <div v-if="!ready" class="grid gap-3" data-testid="routine-list-skeleton">
      <div
        v-for="n in 3"
        :key="n"
        class="p-4 border border-line rounded-sm bg-stone flex items-center gap-3"
        aria-hidden="true"
      >
        <div class="w-8 h-8 rounded-sm bk-shimmer shrink-0" />
        <div class="flex-1 min-w-0 space-y-2">
          <div class="h-4 w-2/3 rounded-sm bk-shimmer" />
          <div class="h-3 w-1/3 rounded-sm bk-shimmer" />
        </div>
      </div>
    </div>

    <!-- UNIFIED-LISTINGS: UNA lista con mías + plantillas globales/públicas
         de otros — gateada en ready para no mostrar el vacío y luego
         reemplazarlo de golpe por la lista real. -->
    <div v-else-if="displayRoutines.length > 0" class="relative grid gap-3">
      <!-- v0.11.7: borrar una rutina difumina su card (bk-remove) -->
      <TransitionGroup name="bk-remove">
      <div
        v-for="item in displayRoutines"
        :key="`${item.kind}-${item.id}`"
        class="p-4 border border-line rounded-sm bg-stone space-y-3"
      >
        <!-- Fila: info a la izquierda (flex-1 min-w-0, trunca si hace
             falta), acciones a la derecha (shrink-0) — mismo criterio que
             la celda de acciones de AdminCard, en vez de las acciones
             colgando debajo del contenido. La zona de info es un <button>
             real (toggle de expansión, side-quest 1 follow-up): las acciones
             quedan FUERA de él como hermano, para que editar/borrar/copiar
             no disparen también el expand/collapse. -->
        <!-- item 12 (v0.4.3, zurdi): items-center (antes items-start) — la
             runa y el grupo de acciones (BkActionBtn) centran contra el alto
             REAL de la fila, que lo pone el botón de info (el más alto,
             nombre+descripción+contador pueden ser 2-3 líneas). items-center
             TAMBIÉN dentro del propio botón (ver su clase, justo debajo): sin
             eso, aunque el botón ya fuera el hijo más alto de la fila, la
             runa se quedaría pegada arriba DENTRO de él, no centrada contra
             su propio bloque de texto. -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="bk-press flex flex-1 min-w-0 items-center gap-3 text-left"
            :aria-expanded="expandedIds.has(item.id) ? 'true' : 'false'"
            :data-testid="item.kind === 'own' ? `toggle-routine-${item.id}` : `toggle-template-${item.id}`"
            @click="toggleExpanded(item.id)"
          >
            <!-- v0.23.1 (zurdi: "aunque tengan fotos, las rutinas no sacan
                 la imagen en el listado — solo la runa"): BkMedia con la
                 foto de la rutina y pozo rúnico de fallback, como el resto
                 de listados del facelift -->
            <BkMedia
              :src="item.has_image ? routineImageUrl(item.id) : undefined"
              :rune="item.rune && isValidRuneName(item.rune) ? (item.rune as RuneName) : null"
              size="sm"
              :data-testid="`routine-media-${item.id}`"
            />
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-ink truncate">{{ item.name }}</h3>
              <p v-if="item.description" class="text-sm text-ink-muted truncate">{{ item.description }}</p>
              <p class="text-sm text-ink-muted mt-1">{{ item.exercises.length }} {{ t('routines.exercises') }}</p>
            </div>
          </button>
          <div class="flex items-center gap-2 shrink-0">
            <!-- item 3: icon-only, como en AdminCard. Acciones por
                 propiedad: mía → editar/borrar/duplicar; global/de otro →
                 solo duplicar (ROUTINES-OPEN: "Duplicar" ya aplica también a
                 las propias, variante rápida de una tuya) -->
            <template v-if="item.kind === 'own'">
              <BkActionBtn
                icon="edit"
                :data-testid="`edit-routine-${item.id}`"
                :aria-label="$t('common.edit')"
                @click="openEditor(item)"
              />
              <BkActionBtn
                v-if="deleteConfirming !== item.id"
                icon="delete"
                :data-testid="`delete-routine-${item.id}`"
                :aria-label="$t('common.delete')"
                @click="deleteConfirming = item.id"
              />
            </template>
            <BkActionBtn
              icon="copy"
              :data-testid="`duplicate-routine-${item.id}`"
              :aria-label="$t('routines.duplicate')"
              @click="duplicateRoutine(item.id)"
            />
          </div>
        </div>

        <!-- ROUTINES-OPEN: fila de atribución DEDICADA (ya no anidada bajo
             el título) — solo para lo que no es mío, misma posición para
             global legacy y para lo is_global de otro usuario. Escala
             text-2xs, subtle: es metadato secundario, no protagonismo.
             Chip "Global" para legacy owner_id NULL, BkUser (punto + nombre,
             size xs) para lo marcado is_global por su dueño. Sin owner_color
             en RoutineOut (fuera de este carril), BkUser cae a su fallback
             aurora — sigue siendo la primitiva correcta. -->
        <div v-if="item.kind !== 'own'" class="flex items-center" :data-testid="`template-attribution-${item.id}`">
          <span
            v-if="item.kind === 'global'"
            class="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-2xs text-ink-faint"
          >
            {{ $t('routines.globalTemplate') }}
          </span>
          <BkUser
            v-else-if="item.owner_username"
            :user="{ username: item.owner_username, color: null }"
            size="xs"
          />
        </div>

        <!-- Lista de ejercicios de la rutina, solo lectura: entra con
             bk-stagger (sistema único de animación de entrada) al expandir;
             el colapso es instantáneo, sin animación de salida -->
        <div
          v-if="expandedIds.has(item.id)"
          :data-testid="item.kind === 'own' ? `exercise-list-${item.id}` : `exercise-list-template-${item.id}`"
          class="space-y-2 border-t border-line pt-3 bk-stagger"
        >
          <div
            v-for="(ex, i) in item.exercises"
            :key="ex.id"
            :style="{ '--bk-stagger-i': i }"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="text-ink truncate">{{ resolvedExerciseName(ex.exercise_id, locale) }}</span>
            <span class="text-ink-muted shrink-0 text-right">
              <!-- item 9: sin en-dash de relleno cuando no hay reps objetivo
                   (p.ej. ejercicios por tiempo) — se omite el ×reps entero -->
              {{ ex.target_sets }}<template v-if="ex.target_reps != null">×{{ ex.target_reps }}</template>
              <template v-if="ex.target_weight_kg != null"> · {{ formatWeight(ex.target_weight_kg, units) }}</template>
              <template v-if="ex.rest_seconds"> · {{ ex.rest_seconds }}s</template>
            </span>
          </div>
          <p v-if="!item.exercises.length" class="text-sm text-ink-faint">
            {{ t('routines.noExercisesInRoutine') }}
          </p>
        </div>

        <!-- Confirmar borrado: fila completa debajo del contenido, no
             encajada junto al nombre — en 390px, "Confirmar"/"Cancelar"
             dejan solo ~95px para la columna del nombre (frente a ~200px
             con los dos iconos normales), demasiado apretado con truncate.
             item 7: pop-in al aparecer (mismo idiom que el resto del carril,
             ver BodySection) — solo entrada, como el resto del sistema.
             Solo aplica a mías (únicas con acción de borrar). -->
        <Transition name="bk-pop-soft" mode="out-in">
          <div v-if="item.kind === 'own' && deleteConfirming === item.id" class="flex gap-2">
            <BkButton
              variant="danger"
              size="sm"
              class="flex-1"
              @click="confirmDelete(item.id)"
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
      </TransitionGroup>
    </div>

    <!-- Empty State: item 10, el botón de crear se muda aquí dentro. UNA
         sola vez, cuando NADA de la lista unificada (mías + plantillas) hay
         que mostrar — ya no un BkEmpty separado por sección. -->
    <BkEmpty
      v-else
      :message="$t('routines.noRoutines')"
      :action-label="$t('routines.newRoutine')"
      action-testid="new-routine-btn"
      @action="openEditor()"
    />

    <!-- Editor Sheet -->
    <RoutineEditorSheet
      :open="editorOpen"
      :routine="selectedRoutine"
      @close="closeEditor"
    />
  </div>
</template>
