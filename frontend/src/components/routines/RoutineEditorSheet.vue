<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, RoutineOut } from '@/api/domain'
import { createRoutine, deleteRoutineImage, listExercises, listMuscleGroups, replaceRoutineExercises, routineImageUrl, updateRoutine, uploadRoutineImage } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { displayToKg, kgToDisplay } from '@/utils/units'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCheck from '@/lib/BkCheck.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import { FUTHARK_RUNE_NAMES, type RuneName } from '@/lib/runes'
import { normalizeSupersets, supersetLabels, type SupersetValue } from '@/lib/supersets'
import { primaryRune } from '@/lib/runeResolve'
import { exerciseName } from './exerciseName'
import RoutineExerciseRow, { type EditorRow } from './RoutineExerciseRow.vue'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet.vue'
import SupersetEditSheet from '@/components/workout/SupersetEditSheet.vue'

const props = defineProps<{ open: boolean; routine?: RoutineOut }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

// kg es el canónico en el store/API; el stepper de peso objetivo se muestra y
// edita en la unidad del usuario (ver frontend/src/utils/units.ts)
const units = computed(() => (auth.user?.units as 'kg' | 'lb') || 'kg')

// State
const name = ref('')
const description = ref('')
const selectedRune = ref<string | null>(null)
// ROUTINES-OPEN: check "Global" (renombrado desde is_public), ahora vive en
// el editor — disponible a CUALQUIER usuario sobre su propia rutina, ya
// marcable al crear (a diferencia del viejo flujo globalize, admin-only y
// que cedía la propiedad)
const isGlobal = ref(false)

// v0.20.x (zurdi): imagen PROPIA de la rutina (el hero la usa; sin ella,
// la runa) — solo editando una existente, mismo criterio que la imagen de
// ejercicio en la biblioteca. La subida/borrado son PUTs inmediatos.
const editingHasImage = ref(false)
const imageBust = ref(Date.now())
const imageUploading = ref(false)
const imageFileEl = ref<HTMLInputElement | null>(null)

async function onRoutineImagePicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file || !props.routine) return
  try {
    imageUploading.value = true
    await uploadRoutineImage(props.routine.id, file)
    editingHasImage.value = true
    imageBust.value = Date.now()
  } catch (error) {
    toastApiError(error)
  } finally {
    imageUploading.value = false
  }
}

async function removeRoutineImage() {
  if (!props.routine) return
  try {
    await deleteRoutineImage(props.routine.id)
    editingHasImage.value = false
  } catch (error) {
    toastApiError(error)
  }
}
// v0.10.0: filas tipadas por el componente de fila (misma anatomía que la
// card del entreno) — superset_group SIEMPRE normalizado tras cada mutación
const exercises = ref<EditorRow[]>([])
// Immutable full catalog (loaded once, used for row-name resolution)
const allExercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<Array<{ id: number; slug: string; name_es: string; name_en: string; owner_id: number | null }>>([])
const loading = ref(false)

// v0.3.0: el picker ya no cura runas de grupo muscular (esas quedan
// reservadas a los propios grupos, ver WeekSummaryCard) — ofrece el futhark
// antiguo completo, para que la runa de la rutina sea una elección libre y
// no se confunda visualmente con "esta rutina trabaja este músculo"
const runes: RuneName[] = FUTHARK_RUNE_NAMES
const berserkerRune: RuneName = 'berserk'

// Methods
async function loadData() {
  try {
    const [exercisesData, muscleGroupsData] = await Promise.all([
      listExercises({}),
      listMuscleGroups(),
    ])
    allExercises.value = exercisesData
    muscleGroups.value = muscleGroupsData
  } catch (error) {
    toastApiError(error)
  }
}

async function initializeForm() {
  if (props.routine) {
    name.value = props.routine.name
    description.value = props.routine.description || ''
    selectedRune.value = props.routine.rune || null
    isGlobal.value = props.routine.is_global ?? false
    editingHasImage.value = props.routine.has_image ?? false
    exercises.value = props.routine.exercises.map(e => ({
      id: String(e.id),
      exercise_id: e.exercise_id,
      target_sets: e.target_sets,
      target_reps: e.target_reps || 0,
      target_weight_kg: e.target_weight_kg || null,
      target_duration_seconds: e.target_duration_seconds ?? null,
      rest_seconds: e.rest_seconds ? String(e.rest_seconds) : '60',
      superset_group: e.superset_group ?? null,
      block_label: e.block_label ?? null,
    }))
    // defensivo: lo guardado puede venir sin normalizar (p.ej. un
    // save-as-routine con contigüidad rota por un reorden mid-workout) —
    // el editor trabaja siempre sobre la forma canónica
    renormalizeSupersets()
  } else {
    name.value = ''
    description.value = ''
    selectedRune.value = null
    // v0.4.3 item 10 (zurdi): "Global" nace marcado al crear — la mayoría de
    // rutinas nuevas se quieren compartidas de entrada, y el backend ya
    // asume lo mismo (RoutineIn.is_global default True). Editar sigue
    // leyendo el valor REAL de la rutina (rama de arriba, sin cambios).
    isGlobal.value = true
    exercises.value = []
  }

  await loadData()
}

// v0.10.0 (zurdi: "el flow de rutina, exactamente el mismo que el de
// entrenamiento"): añadir pasa por el MISMO AddExerciseSheet del entreno
// (buscador con pajar ES+EN+tipo, filtro de grupo y check de superserie) —
// este adaptador satisface su contrato WorkoutActions con mutaciones locales.
// v0.17.0 bloques: pendingBlockLabel = bloque de destino de las próximas
// altas (el "+ añadir aquí" de cada sección lo fija; el botón global lo
// deja a null) — la inserción cae al FINAL del run de ese bloque, así las
// filas del mismo bloque se mantienen contiguas por construcción
const pendingBlockLabel = ref<string | null>(null)

// índice de inserción para un alta con esa etiqueta: tras la última fila
// del bloque (o al final del todo si el bloque aún no tiene filas)
function insertIndexFor(label: string | null): number {
  if (label === null) return exercises.value.length
  let last = -1
  exercises.value.forEach((row, i) => {
    if ((row.block_label ?? null) === label) last = i
  })
  return last === -1 ? exercises.value.length : last + 1
}

let rowSeq = 0
function pushRow(exerciseId: number, label: string | null = null): string {
  const id = `row-${++rowSeq}-${exercises.value.length}`
  const row: EditorRow = {
    id,
    exercise_id: exerciseId,
    target_sets: 3,
    target_reps: 0,
    target_weight_kg: null,
    target_duration_seconds: null,
    rest_seconds: '60',
    // un ejercicio recién añadido nace suelto (o enlazado vía addSupersetPair)
    superset_group: null,
    block_label: label,
  }
  const at = insertIndexFor(label)
  exercises.value = [...exercises.value.slice(0, at), row, ...exercises.value.slice(at)]
  return id
}

const addSheetOpen = ref(false)
const editorActions = {
  addExercise: async (exerciseId: number) => {
    pushRow(exerciseId, pendingBlockLabel.value)
  },
  addSupersetPair: async (exerciseA: number, exerciseB: number) => {
    const label = pendingBlockLabel.value
    const firstId = pushRow(exerciseA, label)
    const secondId = pushRow(exerciseB, label)
    const values = currentSupersetValues()
    const marker = values.length
    const iA = exercises.value.findIndex((r) => r.id === firstId)
    const iB = exercises.value.findIndex((r) => r.id === secondId)
    values[iA] = marker
    values[iB] = marker
    applySupersetValues(normalizeSupersets(values))
  },
}

function openAddTo(label: string | null) {
  pendingBlockLabel.value = label
  addSheetOpen.value = true
}

// ── v0.17.0 BLOQUES (zurdi: "definir bloques en las rutinas, cada bloque
// tiene unos ejercicios") ─────────────────────────────────────────────────
// crear: nombre en un mini-sheet → se abre el AddExerciseSheet apuntando al
// bloque nuevo (un bloque sin filas no existe: la etiqueta vive en las filas)
const newBlockOpen = ref(false)
const newBlockName = ref('')
// v0.17.2: modo asignación — el sheet de nombre se abrió desde el select de
// UNA fila existente: al confirmar, en vez de elegir un primer ejercicio
// nuevo, esa fila se MUEVE al bloque recién nombrado
const newBlockForRowId = ref<string | null>(null)

function confirmNewBlock() {
  const name = newBlockName.value.trim().slice(0, 40)
  if (!name) return
  newBlockOpen.value = false
  newBlockName.value = ''
  if (newBlockForRowId.value !== null) {
    assignRowToBlock(newBlockForRowId.value, name)
    newBlockForRowId.value = null
    return
  }
  openAddTo(name)
}

function closeNewBlock() {
  newBlockOpen.value = false
  newBlockForRowId.value = null
}

// v0.17.2 (zurdi: "quiero poder añadir ejercicios ya existentes a bloques ya
// existentes o crear uno nuevo desde el propio ejercicio"): etiquetas
// existentes en orden de aparición — alimentan el select de cada fila
const existingBlockLabels = computed(() => {
  const labels: string[] = []
  for (const row of exercises.value) {
    if (row.block_label !== null && !labels.includes(row.block_label)) labels.push(row.block_label)
  }
  return labels
})

// mueve la fila al FINAL del bloque destino (o al final de la lista si sale
// a "sin bloque" o el bloque aún no existe) — la contigüidad por bloque se
// conserva por construcción, y renormalize disuelve una superserie que el
// movimiento haya partido
function assignRowToBlock(rowId: string, label: string | null) {
  const row = exercises.value.find((r) => r.id === rowId)
  if (!row || (row.block_label ?? null) === label) return
  const without = exercises.value.filter((r) => r.id !== rowId)
  // índice calculado SIN la fila: quitarla primero evita el corrimiento de
  // una posición al moverse hacia delante dentro del mismo array
  let at = without.length
  if (label !== null) {
    let last = -1
    without.forEach((r, i) => {
      if ((r.block_label ?? null) === label) last = i
    })
    at = last === -1 ? without.length : last + 1
  }
  exercises.value = [...without.slice(0, at), { ...row, block_label: label }, ...without.slice(at)]
  renormalizeSupersets()
}

function openNewBlockFor(rowId: string) {
  newBlockForRowId.value = rowId
  newBlockName.value = ''
  newBlockOpen.value = true
}

// editar: renombrar (todas las filas de la etiqueta) o disolver (etiquetas a
// null — los ejercicios se quedan, solo desaparece la agrupación)
const blockEditFor = ref<string | null>(null)
const blockNameDraft = ref('')

function openBlockEdit(label: string) {
  blockEditFor.value = label
  blockNameDraft.value = label
}

function saveBlockRename() {
  const from = blockEditFor.value
  const to = blockNameDraft.value.trim().slice(0, 40)
  if (!from || !to) return
  exercises.value = exercises.value.map((r) =>
    r.block_label === from ? { ...r, block_label: to } : r,
  )
  blockEditFor.value = null
}

function dissolveEditorBlock() {
  const from = blockEditFor.value
  exercises.value = exercises.value.map((r) =>
    r.block_label === from ? { ...r, block_label: null } : r,
  )
  blockEditFor.value = null
}

function removeExercise(id: string) {
  exercises.value = exercises.value.filter(e => e.id !== id)
  // quitar un miembro puede dejar su grupo en 1 (se disuelve) o unir dos
  // runs del mismo valor que ahora quedan contiguos (siguen siendo un grupo)
  renormalizeSupersets()
}

// v0.17.0 bloques — semántica de flechas en FRONTERA de bloque: en vez de
// saltar por encima de la fila vecina, el ejercicio CAMBIA de bloque (adopta
// la etiqueta del vecino sin moverse de posición): ↑ en la primera fila de
// un bloque lo mete como última fila del bloque de arriba; ↓ en la última lo
// mete como primera del de abajo. Dentro del mismo bloque, swap de siempre.
// La contigüidad por bloque se conserva por construcción en ambos casos.
function moveExerciseUp(index: number) {
  if (index <= 0) return
  const row = exercises.value[index]
  const prev = exercises.value[index - 1]
  if ((prev.block_label ?? null) !== (row.block_label ?? null)) {
    exercises.value = exercises.value.map((r, i) =>
      i === index ? { ...r, block_label: prev.block_label ?? null } : r,
    )
    renormalizeSupersets()
    return
  }
  const next = [...exercises.value]
  ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
  exercises.value = next
  // reordenar recomputa la contigüidad: un grupo roto por el movimiento se
  // parte (los runs de 1 que queden se disuelven a sueltos)
  renormalizeSupersets()
}

function moveExerciseDown(index: number) {
  if (index >= exercises.value.length - 1) return
  const row = exercises.value[index]
  const nextRow = exercises.value[index + 1]
  if ((nextRow.block_label ?? null) !== (row.block_label ?? null)) {
    exercises.value = exercises.value.map((r, i) =>
      i === index ? { ...r, block_label: nextRow.block_label ?? null } : r,
    )
    renormalizeSupersets()
    return
  }
  const next = [...exercises.value]
  ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
  exercises.value = next
  renormalizeSupersets()
}

// ── v0.5.0 superseries ─────────────────────────────────────────────────────

function currentSupersetValues(): SupersetValue[] {
  return exercises.value.map(e => e.superset_group)
}

// referencia NUEVA de array y de cada fila cambiada — mutar el cache
// reactivo in-place esquiva el proxy de Vue (gotcha del repo)
function applySupersetValues(values: SupersetValue[]) {
  exercises.value = exercises.value.map((e, i) =>
    e.superset_group === (values[i] ?? null) ? e : { ...e, superset_group: values[i] ?? null },
  )
}

function renormalizeSupersets() {
  applySupersetValues(normalizeSupersets(currentSupersetValues()))
}

// etiqueta presentacional A/B/C… por fila (null = suelto)
const rowSupersetLabels = computed(() => supersetLabels(exercises.value.map(e => e.superset_group)))

// v0.10.0: bloques como en WorkoutView — miembros de superserie DENTRO de un
// contenedor con chip de cabecera + botón de editar (SupersetEditSheet
// reutilizado tal cual: cambiar un miembro aquí es una mutación local de la
// fila, sin baile de servidor); los toggles de frontera de la v0.5.0 mueren
// también aquí, igual que murieron en el entreno en la v0.8.0.
type EditorBlock = {
  grouped: boolean
  label: string | null
  entries: { row: EditorRow; index: number }[]
}
const editorBlocks = computed<EditorBlock[]>(() => {
  const labels = rowSupersetLabels.value
  const blocks: EditorBlock[] = []
  exercises.value.forEach((row, index) => {
    const label = labels[index]
    const last = blocks[blocks.length - 1]
    if (label !== null && last?.grouped && last.label === label) {
      last.entries.push({ row, index })
    } else {
      blocks.push({ grouped: label !== null, label, entries: [{ row, index }] })
    }
  })
  return blocks
})

// v0.17.0: los contenedores (superseries/filas sueltas) se agrupan en
// SECCIONES por etiqueta de bloque — misma agrupación por etiqueta que el
// stepper del entreno (WorkoutView.workoutSteps); null = fuera de bloque
type EditorSection = {
  label: string | null
  blocks: EditorBlock[]
}
const editorSections = computed<EditorSection[]>(() => {
  const sections: EditorSection[] = []
  const byLabel = new Map<string | null, EditorSection>()
  for (const block of editorBlocks.value) {
    const label = block.entries[0].row.block_label ?? null
    let section = byLabel.get(label)
    if (!section) {
      section = { label, blocks: [] }
      byLabel.set(label, section)
      sections.push(section)
    }
    section.blocks.push(block)
  }
  return sections
})

const editingBlock = ref<EditorBlock | null>(null)
const editingMembers = computed(() =>
  (editingBlock.value?.entries ?? []).map((entry) => {
    const exercise = allExercises.value.find((e) => e.id === entry.row.exercise_id)
    return {
      weid: entry.index,
      name: exerciseName(exercise, auth.user?.locale || 'es'),
      rune: primaryRune(exercise, muscleGroups.value) ?? null,
      // en el editor no hay series que perder al cambiar
      hasSets: false,
    }
  }),
)

function dissolveEditingBlock() {
  const block = editingBlock.value
  if (!block) return
  const values = currentSupersetValues()
  for (const entry of block.entries) values[entry.index] = null
  applySupersetValues(normalizeSupersets(values))
}

function swapEditingMember(index: number, newExerciseId: number) {
  exercises.value = exercises.value.map((row, i) =>
    i === index ? { ...row, exercise_id: newExerciseId } : row,
  )
}

async function saveRoutine() {
  if (!name.value.trim()) {
    toast.push('error', t('routines.nameRequired'))
    return
  }

  try {
    loading.value = true

    let routine: RoutineOut
    if (props.routine) {
      routine = await updateRoutine(props.routine.id, {
        name: name.value,
        description: description.value || null,
        rune: selectedRune.value,
        is_global: isGlobal.value,
      })
    } else {
      routine = await createRoutine({
        name: name.value,
        description: description.value || null,
        rune: selectedRune.value,
        is_global: isGlobal.value,
      })
    }

    // Always save exercises (even if empty)
    await replaceRoutineExercises(routine.id, exercises.value.map(e => {
      // v0.11.1: cardio no tiene reps/peso/descanso — la fila los esconde,
      // pero una rutina vieja puede traerlos guardados: se purgan al salvar
      const isCardio = allExercises.value.find(x => x.id === e.exercise_id)?.measurement === 'cardio'
      return {
        exercise_id: e.exercise_id,
        target_sets: e.target_sets,
        target_reps: isCardio ? null : e.target_reps || null,
        target_weight_kg: isCardio ? null : e.target_weight_kg || null,
        // v0.23.0: el tiempo objetivo es la cara de cardio de los objetivos
        // — y a la inversa, un ejercicio de fuerza lo purga
        target_duration_seconds: isCardio ? e.target_duration_seconds || null : null,
        rest_seconds: !isCardio && e.rest_seconds ? parseInt(e.rest_seconds, 10) : null,
        // ya normalizado (0,1,2…): cada mutación local renormaliza
        superset_group: e.superset_group,
        // v0.17.0 bloques
        block_label: e.block_label,
      }
    }))

    emit('close')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await initializeForm()
    } else {
      addSheetOpen.value = false
      editingBlock.value = null
      pendingBlockLabel.value = null
      newBlockOpen.value = false
      newBlockForRowId.value = null
      blockEditFor.value = null
    }
  },
  { immediate: true }
)
</script>

<template>
  <BkSheet :open="open" :title="routine ? $t('routines.editRoutine') : $t('routines.newRoutine')" @close="emit('close')">
    <div class="space-y-4">
      <!-- Name Field -->
      <BkField
        v-model="name"
        :label="$t('routines.name')"
      />

      <!-- Description Field -->
      <BkField
        v-model="description"
        :label="$t('routines.description')"
        type="text"
      />

      <!-- v0.20.x: imagen de la rutina (solo editando) — el hero de Hoy y
           el pre-inicio la usan; sin ella manda la runa -->
      <div v-if="routine" class="space-y-2">
        <span class="block text-sm text-ink-muted">{{ $t('library.image') }}</span>
        <img
          v-if="editingHasImage"
          :src="routineImageUrl(routine.id, imageBust)"
          :alt="name"
          class="w-full max-h-40 object-cover rounded-md border border-line"
          data-testid="routine-image-preview"
        />
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            size="sm"
            :loading="imageUploading"
            data-testid="routine-image-upload"
            @click="imageFileEl?.click()"
          >
            {{ editingHasImage ? $t('library.imageReplace') : $t('library.imageAdd') }}
          </BkButton>
          <BkButton
            v-if="editingHasImage"
            variant="danger"
            size="sm"
            data-testid="routine-image-delete"
            @click="removeRoutineImage"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
        <input
          ref="imageFileEl"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          data-testid="routine-image-input"
          @change="onRoutineImagePicked"
        />
      </div>

      <!-- Rune Picker: futhark completo (24) + berserk aparte — con el
           grupo muscular fuera del picker, la lista es larga, así que se
           limita la altura y se deja scroll (mismo patrón que la lista de
           ejercicios agrupados más abajo) en vez de empujar el resto del sheet -->
      <div class="space-y-2">
        <span class="block text-sm text-ink-muted">{{ $t('routines.rune') }}</span>
        <div class="flex gap-3 flex-wrap max-h-48 overflow-y-auto">
          <button
            v-for="runeName in runes"
            :key="runeName"
            type="button"
            class="flex items-center justify-center p-3 rounded-sm border transition-all"
            :class="selectedRune === runeName
              ? 'border-aurora bg-aurora/10 text-aurora'
              : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
            "
            @click="selectedRune = selectedRune === runeName ? null : runeName"
          >
            <BkRune :name="(runeName as RuneName)" :size="24" />
          </button>
          <button
            type="button"
            class="flex items-center justify-center p-3 rounded-sm border transition-all"
            :class="selectedRune === 'berserk'
              ? 'border-aurora bg-aurora/10 text-aurora'
              : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
            "
            @click="selectedRune = selectedRune === 'berserk' ? null : 'berserk'"
          >
            <BkRune name="berserk" :size="24" />
          </button>
        </div>
      </div>

      <!-- ROUTINES-OPEN (course correction): check "Global" — disponible a
           CUALQUIER usuario sobre su propia rutina, ya marcable al crear.
           Sustituye al viejo toggle "Compartir como plantilla" de la
           tarjeta y a la conversión admin-only "Convertir en global" (que
           cedía la propiedad) — mismo patrón visual que el checkbox
           isPublic de ExerciseManager. -->
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <BkCheck
            size="sm"
            :model-value="isGlobal"
            data-testid="routine-is-global-checkbox"
            :aria-label="$t('routines.isGlobal')"
            @update:model-value="isGlobal = $event"
          />
          <button type="button" class="bk-press text-sm text-ink-muted" @click="isGlobal = !isGlobal">
            {{ $t('routines.isGlobal') }}
          </button>
        </div>
        <p class="text-xs text-ink-faint pl-6">{{ $t('routines.isGlobalHint') }}</p>
      </div>

      <!-- Exercises Section -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-ink">{{ $t('routines.exercises') }}</h3>

        <!-- v0.10.0 (zurdi: "el flow de rutina, exactamente el mismo que el
             de entrenamiento"): bloques de superserie con contenedor aurora
             + chip + editar (SupersetEditSheet), filas como cards
             (RoutineExerciseRow) y añadir vía el MISMO AddExerciseSheet del
             entreno (buscador+filtros+check de superserie). Los toggles de
             frontera y el buscador inline con debounce murieron. -->
        <!-- v0.17.0 BLOQUES: los contenedores se agrupan en SECCIONES por
             etiqueta (editorSections) — cada bloque con nombre lleva marco
             gris, cabecera con su nombre + editar (renombrar/disolver) y su
             propio "añadir aquí"; las filas sin bloque quedan a ras, como
             siempre. Las flechas en frontera CAMBIAN de bloque (ver
             moveExerciseUp/Down). -->
        <!-- v0.11.7: quitar una fila la difumina mientras las demás cierran
             el hueco (bk-remove, mismas keys en ambas ramas — ver WorkoutView) -->
        <div v-if="exercises.length > 0" class="space-y-3 border-t border-line pt-3">
          <div
            v-for="section in editorSections"
            :key="section.label ?? '__none__'"
            :class="section.label !== null ? 'border border-line rounded-sm p-2 space-y-3' : 'space-y-3'"
            :data-testid="section.label !== null ? `routine-block-${section.label}` : undefined"
          >
            <div v-if="section.label !== null" class="flex items-center justify-between gap-2 px-1">
              <span class="bk-eyebrow truncate">
                {{ section.label }}
              </span>
              <BkActionBtn
                icon="edit"
                :data-testid="`routine-block-edit-${section.label}`"
                :aria-label="$t('routines.blockEdit')"
                @click="openBlockEdit(section.label)"
              />
            </div>

            <div class="relative space-y-3">
              <TransitionGroup name="bk-remove">
              <template v-for="block in section.blocks">
                <div
                  v-if="block.grouped"
                  :key="`block-${block.entries[0].row.id}`"
                  class="border border-aurora/50 rounded-sm p-2 space-y-3"
                  :data-testid="`editor-superset-container-${block.label}`"
                >
                  <div class="flex items-center justify-center gap-2">
                    <span class="text-xs text-aurora border border-aurora/40 rounded-sm px-1.5 py-0.5">
                      {{ $t('routines.supersetLabel', { label: block.label }) }}
                    </span>
                    <BkActionBtn
                      icon="edit"
                      :data-testid="`editor-superset-edit-${block.label}`"
                      :aria-label="$t('workout.supersetEdit')"
                      @click="editingBlock = block"
                    />
                  </div>
                  <RoutineExerciseRow
                    v-for="entry in block.entries"
                    :key="entry.row.id"
                    :row="entry.row"
                    :index="entry.index"
                    :count="exercises.length"
                    :all-exercises="allExercises"
                    :muscle-groups="muscleGroups"
                    :units="units"
                    :locale="auth.user?.locale || 'es'"
                    :block-labels="existingBlockLabels"
                    @move-up="moveExerciseUp"
                    @move-down="moveExerciseDown"
                    @remove="removeExercise"
                    @assign-block="assignRowToBlock"
                    @new-block="openNewBlockFor"
                  />
                </div>
                <RoutineExerciseRow
                  v-else
                  :key="`block-${block.entries[0].row.id}`"
                  :row="block.entries[0].row"
                  :index="block.entries[0].index"
                  :count="exercises.length"
                  :all-exercises="allExercises"
                  :muscle-groups="muscleGroups"
                  :units="units"
                  :locale="auth.user?.locale || 'es'"
                  :block-labels="existingBlockLabels"
                  @move-up="moveExerciseUp"
                  @move-down="moveExerciseDown"
                  @remove="removeExercise"
                  @assign-block="assignRowToBlock"
                  @new-block="openNewBlockFor"
                />
              </template>
              </TransitionGroup>
            </div>

            <BkButton
              v-if="section.label !== null"
              variant="ghost"
              size="sm"
              block
              :data-testid="`routine-block-add-${section.label}`"
              @click="openAddTo(section.label)"
            >
              {{ $t('routines.addHere') }}
            </BkButton>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <BkButton
            variant="ghost"
            block
            data-testid="routine-add-exercise-btn"
            @click="openAddTo(null)"
          >
            {{ $t('routines.addExercise') }}
          </BkButton>
          <!-- v0.17.0: crear bloque = nombre + primer ejercicio (la etiqueta
               vive en las filas: un bloque vacío no existe) -->
          <BkButton
            variant="ghost"
            block
            data-testid="routine-new-block-btn"
            @click="newBlockOpen = true"
          >
            {{ $t('routines.newBlock') }}
          </BkButton>
        </div>

        <AddExerciseSheet :open="addSheetOpen" :actions="editorActions" @close="addSheetOpen = false" />

        <SupersetEditSheet
          :open="editingBlock !== null"
          :label="editingBlock?.label ?? null"
          :members="editingMembers"
          @close="editingBlock = null"
          @dissolve="dissolveEditingBlock"
          @swap="swapEditingMember"
        />

        <!-- v0.17.0: crear bloque — nombre y de ahí al AddExerciseSheet.
             v0.17.2: si se abrió desde el select de una fila (modo
             asignación), al confirmar esa fila se MUEVE al bloque nuevo -->
        <BkSheet :open="newBlockOpen" :title="$t('routines.newBlock')" @close="closeNewBlock">
          <div class="space-y-4" data-testid="new-block-sheet">
            <BkField
              v-model="newBlockName"
              :label="$t('routines.blockName')"
              data-testid="new-block-name-field"
            />
            <p class="text-xs text-ink-faint">
              {{ $t(newBlockForRowId !== null ? 'routines.newBlockAssignHint' : 'routines.newBlockHint') }}
            </p>
            <BkButton
              variant="primary"
              block
              :disabled="!newBlockName.trim()"
              data-testid="new-block-confirm"
              @click="confirmNewBlock"
            >
              {{ $t(newBlockForRowId !== null ? 'routines.newBlockCreate' : 'routines.newBlockConfirm') }}
            </BkButton>
          </div>
        </BkSheet>

        <!-- v0.17.0: editar bloque — renombrar o disolver -->
        <BkSheet
          :open="blockEditFor !== null"
          :title="$t('routines.blockEdit')"
          @close="blockEditFor = null"
        >
          <div class="space-y-4" data-testid="block-edit-sheet">
            <BkField
              v-model="blockNameDraft"
              :label="$t('routines.blockName')"
              data-testid="block-rename-field"
            />
            <BkButton
              variant="primary"
              block
              :disabled="!blockNameDraft.trim()"
              data-testid="block-rename-save"
              @click="saveBlockRename"
            >
              {{ $t('common.save') }}
            </BkButton>
            <div class="border-t border-line pt-3 space-y-2">
              <p class="text-xs text-ink-faint">{{ $t('routines.blockDissolveHint') }}</p>
              <BkButton
                variant="danger"
                block
                data-testid="block-dissolve"
                @click="dissolveEditorBlock"
              >
                {{ $t('routines.blockDissolve') }}
              </BkButton>
            </div>
          </div>
        </BkSheet>
      </div>

      <!-- v0.23.0 (zurdi: "unificar cancelar/guardar entre rutina y
           ejercicio"): cancelar IZQUIERDA, guardar DERECHA, fila entera a
           partes iguales — mismo orden que ExerciseManager -->
      <div class="flex gap-2 pt-3 border-t border-line">
        <BkButton
          variant="ghost"
          class="flex-1"
          @click="emit('close')"
        >
          {{ $t('common.cancel') }}
        </BkButton>
        <BkButton
          variant="primary"
          class="flex-1"
          :loading="loading"
          @click="saveRoutine"
        >
          {{ $t('common.save') }}
        </BkButton>
      </div>
    </div>
  </BkSheet>
</template>
