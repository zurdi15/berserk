<script setup lang="ts">
// v0.14.0 — "te toca" del plan rotatorio en Hoy: la siguiente rutina del
// ciclo con arranque de un toque. Sin plan configurado, la card no existe
// (mismo criterio autocontenido que SocialFeedCard). Solo vista propia.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { RotationOut } from '@/api/domain'
import { getRotation } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'

const { t } = useI18n()
const router = useRouter()
const activeWorkout = useActiveWorkoutStore()

const rotation = ref<RotationOut | null>(null)
const ready = ref(false)
const starting = ref(false)

onMounted(async () => {
  try {
    rotation.value = await getRotation()
  } catch {
    // hint de fondo: sin red, Hoy sigue sin la card
    rotation.value = null
  } finally {
    ready.value = true
  }
})

const nextRoutine = computed(() => {
  if (!rotation.value || rotation.value.next_position === null) return null
  return rotation.value.routines[rotation.value.next_position] ?? null
})

const rune = computed<RuneName | null>(() =>
  nextRoutine.value?.rune && isValidRuneName(nextRoutine.value.rune)
    ? (nextRoutine.value.rune as RuneName)
    : null,
)

// con un entreno YA en curso no se arranca otro: el botón lleva a él
const workoutActive = computed(() => activeWorkout.workout !== null)

async function go() {
  if (workoutActive.value) {
    router.push({ name: 'workout' })
    return
  }
  if (!nextRoutine.value) return
  try {
    starting.value = true
    await activeWorkout.start({ routine_id: nextRoutine.value.id })
    router.push({ name: 'workout' })
  } catch (error) {
    toastApiError(error)
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <BkCard v-if="ready && nextRoutine" :title="t('rotation.todayTitle')" data-testid="rotation-next-card">
    <div class="flex items-center gap-3">
      <BkRune v-if="rune" :name="rune" :size="22" />
      <div class="flex-1 min-w-0">
        <p class="text-ink font-medium truncate" data-testid="rotation-next-name">{{ nextRoutine.name }}</p>
        <p class="text-xs text-ink-faint">{{ t('rotation.todayHint') }}</p>
      </div>
      <BkButton
        variant="primary"
        size="sm"
        :loading="starting"
        data-testid="rotation-start-btn"
        @click="go"
      >
        {{ workoutActive ? t('rotation.continue') : t('rotation.start') }}
      </BkButton>
    </div>
  </BkCard>
</template>
