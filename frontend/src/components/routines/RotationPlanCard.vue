<script setup lang="ts">
// v0.14.0 (zurdi: "rutina semanal rotatoria — siempre te sugiere el
// siguiente entrenamiento que te toca, en orden"): editor del plan. Lista
// ORDENADA de rutinas; cada mutación manda la lista completa (PUT, contrato
// de completitud) y el backend devuelve el "te toca" derivado del historial
// — si una semana queda a medias, la siguiente retoma donde tocaba.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RotationOut, RoutineOut } from '@/api/domain'
import { getRotation, putRotation, putRotationNext, routineImageUrl } from '@/api/domain'
import { useAuthStore } from '@/stores/auth'
import { toastApiError } from '@/utils/apiErrors'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkMedia from '@/lib/BkMedia.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkUser from '@/lib/BkUser.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'

// candidatas a entrar en el plan: las mismas que RoutineList ya lista
// (mías + plantillas visibles) — quien monta esto las baja como prop
const props = defineProps<{ available: RoutineOut[] }>()

const { t } = useI18n()

const rotation = ref<RotationOut | null>(null)
const ready = ref(false)
const addOpen = ref(false)

onMounted(async () => {
  try {
    rotation.value = await getRotation()
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
})

const entries = computed(() => rotation.value?.routines ?? [])
const nextRoutine = computed(() => {
  if (!rotation.value || rotation.value.next_position === null) return null
  return rotation.value.routines[rotation.value.next_position] ?? null
})

const addable = computed(() =>
  props.available.filter((routine) => !entries.value.some((e) => e.id === routine.id)),
)

async function persist(ids: number[]) {
  try {
    rotation.value = await putRotation(ids)
  } catch (error) {
    toastApiError(error)
  }
}

function ids(): number[] {
  return entries.value.map((r) => r.id)
}

function add(routineId: number) {
  addOpen.value = false
  void persist([...ids(), routineId])
}

function remove(routineId: number) {
  void persist(ids().filter((id) => id !== routineId))
}

// v0.15.0 (zurdi: "setear el que toca hoy"): tocar la fila fija el override
// — se consume solo al terminar cualquier entreno del plan (ver backend)
async function setToday(routineId: number) {
  try {
    rotation.value = await putRotationNext(routineId)
  } catch (error) {
    toastApiError(error)
  }
}

function move(index: number, delta: number) {
  const list = ids()
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
  void persist(list)
}

function runeFor(routine: RoutineOut): RuneName | null {
  return routine.rune && isValidRuneName(routine.rune) ? (routine.rune as RuneName) : null
}

const auth = useAuthStore()

// v0.23.0 (zurdi: "el selector no indica de qué user es cada rutina — dos
// rutinas de dos usuarios pueden llamarse igual"): misma atribución que la
// lista unificada de RoutineList — nada para lo mío, chip "Global" para las
// plantillas legacy (owner_id null) y BkUser para las de otros usuarios
function ownerOf(routine: RoutineOut): 'mine' | 'global' | 'user' {
  if ((routine.owner_id ?? null) === null) return 'global'
  return routine.owner_id === auth.user?.id ? 'mine' : 'user'
}
</script>

<template>
  <BkCard v-if="ready" :title="t('rotation.title')" data-testid="rotation-plan">
    <div class="space-y-3">
      <p v-if="!entries.length" class="text-sm text-ink-faint">{{ t('rotation.empty') }}</p>
      <template v-else>
        <!-- te toca: derivado del historial, o fijado a mano tocando una fila -->
        <!-- v0.23.0 (zurdi: "no hay espacio entre 'te toca:' y el nombre"):
             el hueco pasa a ser estructural (gap) — el espacio literal del
             texto se lo comía el condense de whitespace del compilador -->
        <p v-if="nextRoutine" class="text-sm flex items-baseline gap-1 min-w-0" data-testid="rotation-next">
          <span class="text-ink-muted shrink-0">{{ t('rotation.next') }}</span>
          <span class="text-aurora font-medium truncate">{{ nextRoutine.name }}</span>
        </p>
        <p class="text-xs text-ink-faint">{{ t('rotation.tapToSet') }}</p>
        <!-- v0.23.0 (zurdi: "la estética de 'plan rotatorio' no sigue la
             nueva del todo"): filas al idioma facelift — pozo de slab en vez
             de cajas con borde, thumb de media (foto de la rutina o pozo
             rúnico) como en el resto de listados, y la activa marcada con
             lavado aurora + outline en lugar de borde coloreado -->
        <div class="relative bk-slab p-2 space-y-1">
          <TransitionGroup name="bk-remove">
          <div
            v-for="(routine, index) in entries"
            :key="routine.id"
            class="flex items-center gap-2 p-2 rounded-lg text-sm"
            :class="index === rotation!.next_position && 'bg-aurora/10 outline outline-1 outline-aurora/40'"
            :data-testid="`rotation-entry-${routine.id}`"
          >
            <!-- v0.15.0: el cuerpo de la fila fija "la de hoy" de un toque -->
            <button
              type="button"
              class="bk-press flex items-center gap-2 flex-1 min-w-0 text-left"
              :aria-label="t('rotation.setToday')"
              :data-testid="`rotation-set-next-${routine.id}`"
              @click="setToday(routine.id)"
            >
              <span class="bk-metric text-xs text-ink-faint w-4 shrink-0">{{ index + 1 }}</span>
              <BkMedia
                :src="routine.has_image ? routineImageUrl(routine.id) : undefined"
                :rune="runeFor(routine)"
                size="xs"
              />
              <span class="truncate text-ink flex-1 min-w-0">{{ routine.name }}</span>
            </button>
            <button
              v-if="index > 0"
              type="button"
              class="bk-press w-8 h-8 text-ink-muted hover:text-ink shrink-0"
              :aria-label="t('routines.moveUp')"
              :data-testid="`rotation-up-${routine.id}`"
              @click="move(index, -1)"
            >↑</button>
            <button
              v-if="index < entries.length - 1"
              type="button"
              class="bk-press w-8 h-8 text-ink-muted hover:text-ink shrink-0"
              :aria-label="t('routines.moveDown')"
              :data-testid="`rotation-down-${routine.id}`"
              @click="move(index, 1)"
            >↓</button>
            <BkActionBtn
              icon="delete"
              :data-testid="`rotation-remove-${routine.id}`"
              :aria-label="t('common.delete')"
              @click="remove(routine.id)"
            />
          </div>
          </TransitionGroup>
        </div>
      </template>
      <BkButton
        v-if="addable.length"
        variant="ghost"
        size="sm"
        block
        data-testid="rotation-add-btn"
        @click="addOpen = true"
      >
        {{ t('rotation.add') }}
      </BkButton>
    </div>

    <BkSheet :open="addOpen" :title="t('rotation.add')" @close="addOpen = false">
      <div class="space-y-1">
        <button
          v-for="routine in addable"
          :key="routine.id"
          type="button"
          class="bk-press w-full flex items-center gap-2 text-left p-2 rounded-sm hover:bg-stone text-sm text-ink"
          :data-testid="`rotation-pick-${routine.id}`"
          @click="add(routine.id)"
        >
          <BkMedia
            :src="routine.has_image ? routineImageUrl(routine.id) : undefined"
            :rune="runeFor(routine)"
            size="xs"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate">{{ routine.name }}</p>
            <!-- v0.23.0: de quién es cada rutina — dos usuarios pueden tener
                 una "Pierna" cada uno y sin esto son indistinguibles -->
            <div
              v-if="ownerOf(routine) !== 'mine'"
              class="mt-0.5"
              :data-testid="`rotation-pick-owner-${routine.id}`"
            >
              <span
                v-if="ownerOf(routine) === 'global'"
                class="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-2xs text-ink-faint"
              >
                {{ t('routines.globalTemplate') }}
              </span>
              <BkUser
                v-else-if="routine.owner_username"
                :user="{ username: routine.owner_username, color: null }"
                size="xs"
              />
            </div>
          </div>
        </button>
      </div>
    </BkSheet>
  </BkCard>
</template>
