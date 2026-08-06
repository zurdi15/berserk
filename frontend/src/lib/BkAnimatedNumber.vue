<script setup lang="ts">
import { useAnimatedNumber } from '@/composables/useAnimatedNumber'

// envoltorio mínimo para números animados DENTRO de un v-for: el composable
// necesita su propio scope (watch + onScopeDispose) por fila, algo que una
// función de formato inline en el padre no puede darle — una instancia de
// componente por fila (keyed) es la unidad de scope que Vue ya gestiona.
// Sin wrapper propio ni clases: reenvía el valor animado vía slot con ámbito.
// `decimals` por defecto 0 (conteos); las filas de magnitudes con decimales
// reales (pesos) lo pasan explícito, ver RecentPrs/PrList.
const props = withDefaults(defineProps<{ value: number | null | undefined; decimals?: number }>(), { decimals: 0 })

const display = useAnimatedNumber(() => props.value ?? null, { decimals: props.decimals })
</script>

<template>
  <slot :value="display" />
</template>
