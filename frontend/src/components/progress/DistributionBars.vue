<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DistributionItem, MuscleGroupOut } from '@/api/domain'
import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkRune from '@/lib/BkRune.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { core } from '@/tokens'
import { barWidth } from './distribution'

const props = withDefaults(
  defineProps<{ items: DistributionItem[]; groups: MuscleGroupOut[] }>(),
  { items: () => [], groups: () => [] },
)

const { locale, t } = useI18n()

const groupMap = computed(() => new Map(props.groups.map((g) => [g.id, g])))

// orden descendente: el grupo más entrenado primero, lectura más útil que el
// orden por id que ya trae el backend
const sortedItems = computed(() => [...props.items].sort((a, b) => b.sets - a.sets))

const max = computed(() => Math.max(1, ...props.items.map((i) => i.sets)))

// item 6: todas las barras crecen a la MISMA velocidad visual, así que la
// duración es proporcional a su magnitud relativa al máximo — dur[5] entero
// para la barra más larga, un suelo en dur[1] para que una barra minúscula
// no sea instantánea (ver .bk-grow-x en animations.css)
const BAR_DUR_MAX = parseInt(core.dur[5], 10)
const BAR_DUR_MIN = parseInt(core.dur[1], 10)

function barDuration(sets: number, maxSets: number): string {
  const pct = maxSets > 0 ? Math.min(1, sets / maxSets) : 0
  return `${Math.max(BAR_DUR_MIN, Math.round(BAR_DUR_MAX * pct))}ms`
}

function groupName(muscleGroupId: number): string {
  const group = groupMap.value.get(muscleGroupId)
  if (!group) return ''
  return locale.value === 'es' ? group.name_es : group.name_en
}

function groupRune(muscleGroupId: number): RuneName | null {
  const group = groupMap.value.get(muscleGroupId)
  return group && isValidRuneName(group.slug) ? group.slug : null
}
</script>

<template>
  <BkEmpty v-if="!items.length" :message="t('progress.noDistribution')" />
  <div v-else class="space-y-3">
    <div
      v-for="item in sortedItems"
      :key="item.muscle_group_id"
      :data-testid="`distribution-row-${item.muscle_group_id}`"
      class="flex items-center gap-3"
    >
      <BkRune v-if="groupRune(item.muscle_group_id)" :name="(groupRune(item.muscle_group_id) as RuneName)" :size="20" />
      <span class="text-sm text-ink-muted w-24 shrink-0 truncate">{{ groupName(item.muscle_group_id) }}</span>
      <div class="flex-1 h-2 rounded-xs bg-stone overflow-hidden">
        <div
          class="h-full bg-aurora rounded-xs bk-grow-x"
          :style="{ width: barWidth(item.sets, max), '--bar-dur': barDuration(item.sets, max) }"
        />
      </div>
      <BkAnimatedNumber :value="item.sets" v-slot="{ value }">
        <span class="bk-metric text-sm text-ink w-8 text-right" data-testid="distribution-sets">{{ value ?? 0 }}</span>
      </BkAnimatedNumber>
    </div>
  </div>
</template>
