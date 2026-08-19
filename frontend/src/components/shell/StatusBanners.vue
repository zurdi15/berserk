<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { online } from '@/offline/net'
import * as outbox from '@/offline/outbox'
import { getActAs, switchActAs } from '@/utils/actAs'
import AthleteBanner from './AthleteBanner.vue'

// facelift: las tres bandas de estado del shell (atleta, act-as, offline)
// agrupadas en una sola franja — antes vivían sueltas en ShellView y podían
// apilarse como tres barras desconectadas encima del contenido. La lógica no
// cambia: solo se muda la presentación (testids y strings van verbatim).
// El CABLEADO offline (attachNetListeners, syncNow, onDrained) sigue en
// ShellView: esto solo LEE online/pendingCount.
const { t } = useI18n()

// v0.17.0 act-as: leído UNA vez al montar — el modo solo cambia vía
// switchActAs, que recarga la app entera (ver utils/actAs.ts)
const actAs = getActAs()

function exitActAs() {
  void switchActAs(null)
}
</script>

<template>
  <div>
    <AthleteBanner />
    <!-- v0.17.0 act-as: banda PERSISTENTE mientras un admin actúa como otro
         usuario — acento ember (no aurora: el modo atleta es "ver", esto es
         OPERAR con otra identidad y debe distinguirse de un vistazo) -->
    <div
      v-if="actAs"
      data-testid="act-as-banner"
      class="flex items-center justify-between gap-2 px-4 py-1.5 border-b border-ember bg-stone text-sm"
    >
      <span class="text-ember">{{ t('admin.actingAs', { name: actAs.username }) }}</span>
      <button
        type="button"
        data-testid="act-as-exit"
        class="bk-press text-ink-muted hover:text-ink"
        @click="exitActAs"
      >
        {{ t('admin.actAsExit') }}
      </button>
    </div>
    <!-- v0.6.0 offline: banda de estado — visible sin red o con cola
         pendiente; desaparece sola al drenar. Informativa, no interactiva:
         la sincronización es automática (ver ShellView.onMounted) y un botón
         de "reintentar" solo duplicaría lo que los triggers ya hacen. -->
    <div
      v-if="!online || outbox.pendingCount.value > 0"
      class="border-b border-line bg-stone px-4 py-1.5 text-center text-xs text-ink-muted"
      data-testid="offline-chip"
    >
      <template v-if="!online">
        {{ t('offline.badge') }}<template v-if="outbox.pendingCount.value > 0"> · {{ t('offline.pending', { n: outbox.pendingCount.value }) }}</template>
      </template>
      <template v-else>{{ t('offline.syncing') }}</template>
    </div>
  </div>
</template>
