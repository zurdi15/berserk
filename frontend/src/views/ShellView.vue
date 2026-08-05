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
    <!-- Desktop navbar: barra superior centrada con destinos (identidad por ahora en móvil) -->
    <header class="hidden sm:block border-b border-line">
      <nav :aria-label="$t('app.nav.label')">
        <ul class="flex justify-center gap-2">
          <li v-for="item in items" :key="item.name">
            <RouterLink
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 px-3 py-2 text-ink-faint hover:text-ink"
              active-class="text-aurora"
            >
              <span class="text-[0.65rem] uppercase tracking-wide">{{ $t(item.label) }}</span>
              <span :class="item.name === 'workout' && 'bk-slab -mb-5 p-2.5 border-aurora text-aurora bk-breathe shadow-(--bk-shadow-aurora)'">
                <BkRune :name="item.rune" :size="item.name === 'workout' ? 26 : 20" :carve="item.name === 'workout'" />
              </span>
            </RouterLink>
          </li>
        </ul>
      </nav>
    </header>
    <!-- Mobile identity header: cabecera fina + identidad -->
    <header class="sm:hidden flex items-center gap-2 px-4 py-3 border-b border-line justify-center">
      <BkRune name="berserk" :size="20" tone="aurora" />
      <span class="font-display font-bold tracking-widest uppercase text-sm">
        {{ $t('app.name') }}
      </span>
    </header>
    <!-- Mobile bottom nav: barra inferior fija en móvil; oculta en desktop -->
    <nav
      class="fixed inset-x-0 bottom-0 z-(--bk-z-nav) border-t border-line bg-stone pb-[env(safe-area-inset-bottom)] sm:hidden"
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
              :class="item.name === 'workout' && 'bk-slab -mt-5 p-2.5 border-aurora text-aurora bk-breathe shadow-(--bk-shadow-aurora)'"
            >
              <BkRune :name="item.rune" :size="item.name === 'workout' ? 26 : 20" :carve="item.name === 'workout'" />
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
