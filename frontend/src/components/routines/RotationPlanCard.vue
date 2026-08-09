<script setup lang="ts">
// v0.14.0 (zurdi: "rutina semanal rotatoria — siempre te sugiere el
// siguiente entrenamiento que te toca, en orden"): editor del plan. Lista
// ORDENADA de rutinas; cada mutación manda la lista completa (PUT, contrato
// de completitud) y el backend devuelve el "te toca" derivado del historial
// — si una semana queda a medias, la siguiente retoma donde tocaba.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RotationOut, RoutineOut } from '@/api/domain'
import { getRotation, putRotation } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
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
</script>

<template>
  <BkCard v-if="ready" :title="t('rotation.title')" data-testid="rotation-plan">
    <div class="space-y-3">
      <p v-if="!entries.length" class="text-sm text-ink-faint">{{ t('rotation.empty') }}</p>
      <template v-else>
        <!-- te toca: derivado del historial, no editable -->
        <p v-if="nextRoutine" class="text-sm" data-testid="rotation-next">
          <span class="text-ink-muted">{{ t('rotation.next') }} </span>
          <span class="text-aurora font-medium">{{ nextRoutine.name }}</span>
        </p>
        <div class="relative space-y-2">
          <TransitionGroup name="bk-remove">
          <div
            v-for="(routine, index) in entries"
            :key="routine.id"
            class="flex items-center gap-2 p-2 rounded border text-sm"
            :class="index === rotation!.next_position ? 'border-aurora/60 bg-aurora/5' : 'border-line'"
            :data-testid="`rotation-entry-${routine.id}`"
          >
            <span class="bk-metric text-xs text-ink-faint w-4 shrink-0">{{ index + 1 }}</span>
            <BkRune v-if="runeFor(routine)" :name="runeFor(routine)!" :size="14" />
            <span class="truncate text-ink flex-1 min-w-0">{{ routine.name }}</span>
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
          <BkRune v-if="runeFor(routine)" :name="runeFor(routine)!" :size="14" />
          <span class="truncate">{{ routine.name }}</span>
        </button>
      </div>
    </BkSheet>
  </BkCard>
</template>
