<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import { useAuthStore } from '@/stores/auth'

// item 6 (post-0.3.0): mismo ajuste que LoginView.vue — ver ese archivo para
// la aritmética completa y el porqué real del "scroll" (gutter del html, no
// un desbordamiento de contenido)
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const token = route.params.token as string

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.redeemAccount(token, username.value, password.value)
    router.push({ name: 'today' })
  } catch (e) {
    error.value = e instanceof ApiError ? `errors.${e.slug}` : 'errors.generic'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh flex flex-col items-center justify-center gap-6 px-6">
    <Transition name="bk-pop" appear>
      <BkRune name="berserk" :size="64" carve tone="aurora" />
    </Transition>
    <Transition name="bk-rise" appear>
      <form class="bk-slab w-full max-w-sm p-6 flex flex-col gap-4" @submit.prevent="submit">
        <div>
          <h2 class="font-display font-semibold uppercase tracking-wider text-sm">
            {{ $t('auth.redeemTitle') }}
          </h2>
          <p class="text-sm text-ink-faint mt-1">{{ $t('auth.redeemHint') }}</p>
        </div>
        <BkField v-model="username" :label="$t('auth.username')" autocomplete="username" />
        <BkField
          v-model="password"
          :label="$t('auth.password')"
          type="password"
          autocomplete="new-password"
          :error="error ? $t(error) : undefined"
        />
        <BkButton type="submit" variant="primary" :loading="loading" block>
          {{ $t('auth.create') }}
        </BkButton>
      </form>
    </Transition>
  </main>
</template>
