<script setup lang="ts">
// v0.12.0 (backlog social): feed de actividad de los usuarios que comparten
// su registro conmigo + comparativa amistosa de la semana. Si nadie comparte
// conmigo, la card entera desaparece (visible) — cero ruido para cuentas sin
// vida social. Autocontenida: carga su propio feed (solo se monta en la
// vista PROPIA de Hoy, ver TodayView).
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FeedOut } from '@/api/domain'
import { getSocialFeed } from '@/api/domain'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { formatDateShort, todayIso } from '@/utils/dates'
import { formatWeight, kgToDisplay } from '@/utils/units'
import BkCard from '@/lib/BkCard.vue'
import BkUser from '@/lib/BkUser.vue'
import { getViewCache, setViewCache } from '@/utils/viewCache'

const { t, locale } = useI18n()
const units = useDisplayUnits()

const feed = ref<FeedOut | null>(null)
const ready = ref(false)

onMounted(async () => {
  // facelift v3: el feed de la última visita pinta al instante
  const cached = getViewCache<FeedOut>('today:feed')
  if (cached) {
    feed.value = cached
    ready.value = true
  }
  try {
    feed.value = await getSocialFeed()
    if (feed.value) setViewCache('today:feed', feed.value)
  } catch {
    // hint de fondo: sin red o con error, Hoy sigue con lo hidratado (o sin feed)
    if (!cached) feed.value = null
  } finally {
    ready.value = true
  }
})

const visible = computed(
  () => feed.value !== null && (feed.value.events.length > 0 || feed.value.comparison.length > 1),
)

function groupsFor(eventIndex: number): string {
  const event = feed.value!.events[eventIndex]
  const names = locale.value === 'en' ? event.muscle_groups_en : event.muscle_groups_es
  return names.join(', ')
}

function dateLabel(iso: string): string {
  if (iso === todayIso()) return t('today.feed.today')
  return formatDateShort(iso, locale.value)
}

function durationLabel(seconds: number): string {
  return `${Math.round(seconds / 60)} min`
}

function volumeLabel(volumeKg: number): string {
  // volumen redondeado a enteros en display (misma política que las stats
  // derivadas del resto de la app: reales conservan precisión, derivados no)
  return formatWeight(Math.round(kgToDisplay(volumeKg, units.value)), units.value)
}
</script>

<template>
  <BkCard v-if="ready && visible" :title="t('today.feed.title')" data-testid="social-feed">
    <div class="space-y-3">
      <div
        v-for="(event, i) in feed!.events"
        :key="`${event.user.id}-${event.workout_id}`"
        class="space-y-0.5"
        :data-testid="`feed-event-${i}`"
      >
        <div class="flex items-center gap-2 min-w-0">
          <BkUser :user="event.user" size="sm" />
          <span class="text-xs text-ink-muted truncate">
            {{ groupsFor(i) ? t('today.feed.trained', { groups: groupsFor(i) }) : t('today.feed.trainedPlain') }}
          </span>
          <span
            v-if="event.pr_count > 0"
            class="text-2xs text-ember border border-ember/50 bg-ember/10 rounded-sm px-1 py-0.5 shrink-0"
            :data-testid="`feed-prs-${i}`"
          >
            {{ t('today.feed.prs', { n: event.pr_count }) }}
          </span>
        </div>
        <p class="bk-metric text-2xs text-ink-faint pl-4">
          {{ dateLabel(event.date) }}<template v-if="event.duration_seconds"> · {{ durationLabel(event.duration_seconds) }}</template><template v-if="event.volume_kg"> · {{ volumeLabel(event.volume_kg) }}</template>
        </p>
      </div>
      <p v-if="!feed!.events.length" class="text-sm text-ink-faint">{{ t('today.feed.empty') }}</p>

      <!-- comparativa amistosa de la semana: solo con alguien con quien compararse -->
      <div v-if="feed!.comparison.length > 1" class="pt-2 border-t border-line overflow-x-auto" data-testid="feed-comparison">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-ink-faint text-left">
              <th class="font-normal py-1"><span class="sr-only">{{ t('today.feed.user') }}</span></th>
              <th class="font-normal py-1 text-right">{{ t('today.feed.streak') }}</th>
              <th class="font-normal py-1 text-right">{{ t('today.feed.workouts') }}</th>
              <th class="font-normal py-1 text-right">{{ t('today.feed.volume') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in feed!.comparison" :key="row.user.id" :data-testid="`feed-comparison-${row.user.id}`">
              <td class="py-1 pr-2">
                <span v-if="row.is_me" class="text-xs text-aurora">{{ t('today.feed.me') }}</span>
                <BkUser v-else :user="row.user" size="sm" />
              </td>
              <td class="bk-metric py-1 text-right">{{ row.streak_weeks }}</td>
              <td class="bk-metric py-1 text-right">{{ row.week_workouts }}</td>
              <td class="bk-metric py-1 text-right">{{ volumeLabel(row.week_volume_kg) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </BkCard>
</template>
