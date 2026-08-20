<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import { useAuthStore } from '@/stores/auth'

// item 6 (post-0.3.0): la causa real del "scroll" que veía zurdi era el html
// forzando un scrollbar/gutter permanente (ver base.css) — el contenido de
// por sí cabe con margen de sobra incluso en un móvil bajo (~112px rune+
// título + 32px de gap + ~254px del form ≈ 400px, frente a los ~640-850px
// típicos). gap-6 (antes gap-8, ver <template>) es un margen extra de
// seguridad para viewports realmente cortos (apaisado, teclado abierto), no
// una respuesta a un desbordamiento real medido.
const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    router.push({ name: 'today' })
  } catch (e) {
    error.value = e instanceof ApiError ? `errors.${e.slug}` : 'errors.generic'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 bk-safe-top">
    <Transition name="bk-pop" appear>
      <div class="flex flex-col items-center gap-3">
        <BkRune name="berserk" :size="72" carve tone="aurora" />
        <h1 class="font-display font-bold text-3xl tracking-widest uppercase">
          {{ $t('app.name') }}
        </h1>
      </div>
    </Transition>
    <Transition name="bk-rise" appear>
      <form class="bk-slab w-full max-w-sm p-6 flex flex-col gap-4" @submit.prevent="submit">
        <h2 class="bk-title text-ink-muted">
          {{ $t('auth.loginTitle') }}
        </h2>
        <BkField v-model="username" :label="$t('auth.username')" autocomplete="username" />
        <BkField
          v-model="password"
          :label="$t('auth.password')"
          type="password"
          autocomplete="current-password"
          :error="error ? $t(error) : undefined"
        />
        <BkButton type="submit" :loading="loading" block>{{ $t('auth.login') }}</BkButton>
      </form>
    </Transition>
  </main>
</template>
