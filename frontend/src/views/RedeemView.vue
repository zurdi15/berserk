<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { isPasswordValid, passwordErrorKey } from '@/utils/passwordValidation'
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

// item (v0.4.0): validación de cliente ANTES de someter — mismo arreglo que
// BootstrapView.vue/PasswordCard.vue (ver apiErrors.ts para la parte servidor)
const clientPasswordError = computed(() => passwordErrorKey(password.value))
const fieldError = computed(() => clientPasswordError.value ?? (error.value || null))

async function submit() {
  if (!isPasswordValid(password.value)) return
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
  <main class="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 bk-safe-top">
    <Transition name="bk-pop" appear>
      <BkRune name="berserk" :size="72" carve tone="aurora" />
    </Transition>
    <Transition name="bk-rise" appear>
      <form class="bk-slab w-full max-w-sm p-6 flex flex-col gap-4" @submit.prevent="submit">
        <div>
          <h2 class="bk-title text-ink">
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
          :error="fieldError ? $t(fieldError) : undefined"
        />
        <BkButton type="submit" variant="primary" :loading="loading" :disabled="!isPasswordValid(password)" block>
          {{ $t('auth.create') }}
        </BkButton>
      </form>
    </Transition>
  </main>
</template>
