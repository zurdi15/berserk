import { onScopeDispose, ref, watch, type Ref } from 'vue'

import { core } from '@/tokens'

// count-up con requestAnimationFrame: portado de turtletrips (mismo composable,
// misma semántica) con dos adaptaciones de berserk — duración por defecto
// tomada de los tokens (igual que BkCelebration) y respeto explícito de
// reduced-motion en JS, porque el guard CSS único del sistema de animación
// (animations.css) no alcanza a un ref que cambia por rAF sin animation/transition.
export function useAnimatedNumber(
  source: () => number | null | undefined,
  options: { duration?: number; decimals?: number } = {},
): Ref<number | null> {
  const duration = options.duration ?? parseInt(core.dur[4], 10)
  // decimales del TWEEN, no del valor final: sin este redondeo por frame, un
  // valor intermedio como 1567.4972637 (arrastrado de from+(to-from)*eased)
  // se pinta tal cual y ensancha la card a media animación — el bug que
  // rompía el layout y desanclaba la bottom bar en móvil (mismo mecanismo
  // que el desborde de las tabs de Perfil)
  const decimals = options.decimals ?? 0
  const display = ref<number | null>(null)
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : null
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : () => undefined
  // se lee una sola vez a la creación (no en cada frame): un cambio de
  // preferencia en marcha no debe cortar en seco una animación ya arrancada
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0

  function animate(from: number, to: number) {
    if (!raf || duration <= 0 || reducedMotion) {
      display.value = to
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      // el frame final conserva `to` exacto (sin redondear): el redondeo es
      // solo cosmético para los frames intermedios del tween
      display.value = t < 1 ? Number((from + (to - from) * eased).toFixed(decimals)) : to
      if (t < 1) frame = raf(step)
    }
    frame = raf(step)
  }

  watch(
    source,
    (target) => {
      caf(frame)
      // el dato crudo decide si se pinta un guion; el ref animado solo aporta
      // los dígitos — null se refleja al instante, sin animación posible
      if (target == null) {
        display.value = null
        return
      }
      const from = display.value ?? 0
      if (from === target) {
        display.value = target
        return
      }
      animate(from, target)
    },
    { immediate: true },
  )

  onScopeDispose(() => caf(frame))

  return display
}
