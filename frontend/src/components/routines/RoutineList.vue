<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RoutineOut } from '@/api/domain'
import { deleteRoutine, listRoutines } from '@/api/domain'
import { isValidRuneName } from '@/lib/runeResolve'
import { toastApiError } from '@/utils/apiErrors'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import type { RuneName } from '@/lib/runes'
import RoutineEditorSheet from './RoutineEditorSheet.vue'

const { t } = useI18n()

const routines = ref<RoutineOut[]>([])
const editorOpen = ref(false)
const selectedRoutine = ref<RoutineOut | undefined>()
const loading = ref(false)
const deleteConfirming = ref<number | null>(null)

async function loadRoutines() {
  try {
    loading.value = true
    routines.value = await listRoutines()
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
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
    <!-- Header -->
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold text-ink">{{ $t('profile.routinesTab') }}</h2>
      <BkButton
        variant="primary"
        size="sm"
        @click="openEditor()"
      >
        {{ $t('routines.newRoutine') }}
      </BkButton>
    </div>

    <!-- Routines List -->
    <div v-if="routines.length > 0" class="grid gap-3">
      <div
        v-for="routine in routines"
        :key="routine.id"
        class="p-4 border border-line rounded-sm bg-stone space-y-3"
      >
        <!-- Header with name and rune -->
        <div class="flex items-center gap-3">
          <div v-if="routine.rune && isValidRuneName(routine.rune)" class="text-ink">
            <BkRune :name="(routine.rune as RuneName)" :size="32" />
          </div>
          <div class="flex-1">
            <h3 class="font-semibold text-ink">{{ routine.name }}</h3>
            <p v-if="routine.description" class="text-sm text-ink-muted">{{ routine.description }}</p>
          </div>
        </div>

        <!-- Exercise count -->
        <div class="text-sm text-ink-muted">
          {{ routine.exercises.length }} {{ t('routines.exercises') }}
        </div>

        <!-- Actions -->
        <div class="flex gap-2">
          <BkButton
            variant="primary"
            size="sm"
            @click="openEditor(routine)"
          >
            {{ $t('common.edit') }}
          </BkButton>
          <div v-if="deleteConfirming === routine.id" class="flex gap-2 flex-1">
            <BkButton
              variant="danger"
              size="sm"
              @click="confirmDelete(routine.id)"
            >
              {{ $t('routines.confirm') }}
            </BkButton>
            <BkButton
              variant="ghost"
              size="sm"
              @click="deleteConfirming = null"
            >
              {{ $t('common.cancel') }}
            </BkButton>
          </div>
          <BkButton
            v-else
            variant="danger"
            size="sm"
            @click="deleteConfirming = routine.id"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <BkEmpty v-else :message="$t('routines.noRoutines')" />

    <!-- Editor Sheet -->
    <RoutineEditorSheet
      :open="editorOpen"
      :routine="selectedRoutine"
      @close="closeEditor"
    />
  </div>
</template>
