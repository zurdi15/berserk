<script setup lang="ts">
import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'

const items: { name: string; label: string; rune: RuneName }[] = [
  { name: 'today', label: 'app.nav.today', rune: 'streak' },
  { name: 'calendar', label: 'app.nav.calendar', rune: 'core' },
  { name: 'workout', label: 'app.nav.workout', rune: 'berserk' },
  { name: 'progress', label: 'app.nav.progress', rune: 'pr' },
  { name: 'profile', label: 'app.nav.profile', rune: 'shoulders' },
]
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <header class="flex items-center gap-2 px-4 py-3 border-b border-line sm:justify-center">
      <BkRune name="berserk" :size="20" tone="aurora" />
      <span class="font-display font-bold tracking-widest uppercase text-sm">
        {{ $t('app.name') }}
      </span>
    </header>
    <!-- en móvil barra inferior fija; en desktop fluye bajo la cabecera como fila de pestañas (la nav de escritorio definitiva puede refinarse en fase 4) -->
    <nav
      class="fixed inset-x-0 bottom-0 z-(--bk-z-nav) border-t border-line bg-stone pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:border-b sm:bg-transparent sm:pb-0"
      :aria-label="$t('app.nav.label')"
    >
      <ul class="flex justify-around max-w-3xl mx-auto">
        <li v-for="item in items" :key="item.name" class="flex-1">
          <RouterLink
            :to="{ name: item.name }"
            class="flex flex-col items-center gap-1 py-2 text-ink-faint"
            active-class="text-aurora"
          >
            <span
              :class="item.name === 'workout' && 'bk-slab -mt-5 p-2.5 border-aurora text-aurora sm:mt-0'"
            >
              <BkRune :name="item.rune" :size="item.name === 'workout' ? 26 : 20" />
            </span>
            <span class="text-[0.65rem] uppercase tracking-wide">{{ $t(item.label) }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
    <main class="flex-1 px-4 py-4 pb-24 sm:pb-4 max-w-3xl w-full mx-auto">
      <RouterView v-slot="{ Component }">
        <Transition name="bk-rise" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
