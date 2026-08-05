<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'ember'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', loading: false, block: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="loading || undefined"
    :aria-busy="loading ? 'true' : undefined"
    class="bk-press inline-flex items-center justify-center gap-2 font-display font-semibold uppercase tracking-wide rounded-sm border transition-colors disabled:opacity-50"
    :class="[
      block && 'w-full',
      size === 'sm' && 'px-3 py-1.5 text-sm',
      size === 'md' && 'px-5 py-2.5',
      size === 'lg' && 'px-6 py-3.5 text-lg',
      variant === 'primary' && 'bg-aurora-deep border-aurora text-ink hover:bg-aurora hover:text-void',
      variant === 'ghost' && 'bg-transparent border-line text-ink-muted hover:border-line-strong hover:text-ink',
      variant === 'danger' && 'bg-transparent border-danger text-danger hover:bg-danger hover:text-void',
      variant === 'ember' && 'bg-ember-deep border-ember text-void hover:bg-ember',
    ]"
  >
    <span v-if="loading" class="bk-shimmer inline-block w-4 h-4 rounded-full border-2 border-line-strong" aria-hidden="true" />
    <slot />
  </button>
</template>
