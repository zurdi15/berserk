import { onBeforeUnmount, ref } from 'vue'
import { isTopLayer, popLayer, pushLayer } from '@/lib/layerStack'

// alto máximo ASUMIDO del panel: la decisión de abrir arriba o abajo se toma
// con este número, no con el alto real medido, para no depender de que el
// panel ya esté en el DOM (montado tras open=true) antes de poder decidir
// dónde pintarlo. Debe reflejar el max-h-64 (16rem) que usan los paneles que
// consumen este composable — si ese valor cambia allí, cambia aquí también.
const ASSUMED_PANEL_HEIGHT_PX = 256
const VIEWPORT_MARGIN_PX = 8

// Composable compartido por BkSelect/BkTimeField/BkDateField: posiciona un
// panel teletransportado bajo su trigger (con flip hacia arriba si no cabe
// debajo), y centraliza el cierre por Escape/click-fuera usando la misma
// pila de capas que BkSheet (ver layerStack.ts) — así un panel abierto
// DENTRO de un sheet se come el primer Escape él solo, sin cerrar el sheet.
export function useFloatingPanel() {
  const triggerEl = ref<HTMLElement | null>(null)
  const panelEl = ref<HTMLElement | null>(null)
  const open = ref(false)
  const panelStyle = ref<Record<string, string>>({})
  const id = Symbol('floating-panel')

  function computePosition() {
    const trigger = triggerEl.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openAbove =
      spaceBelow < ASSUMED_PANEL_HEIGHT_PX + VIEWPORT_MARGIN_PX && spaceAbove > spaceBelow

    panelStyle.value = {
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      ...(openAbove
        ? { bottom: `${window.innerHeight - rect.top}px` }
        : { top: `${rect.bottom}px` }),
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (!isTopLayer(id)) return
    event.preventDefault()
    closePanel()
  }

  // pointerdown (no click): dispara antes que el click de una opción del
  // panel, así que si el target cae dentro del panel o del trigger, dejamos
  // que su propio manejador de click decida (selección, toggle...) en vez de
  // cerrar aquí primero y perder ese click
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node
    if (triggerEl.value?.contains(target)) return
    if (panelEl.value?.contains(target)) return
    closePanel()
  }

  function openPanel() {
    if (open.value) return
    computePosition()
    open.value = true
    pushLayer(id)
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', computePosition)
  }

  function closePanel() {
    if (!open.value) return
    open.value = false
    popLayer(id)
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('resize', computePosition)
  }

  function togglePanel() {
    if (open.value) closePanel()
    else openPanel()
  }

  onBeforeUnmount(closePanel)

  return { triggerEl, panelEl, open, panelStyle, openPanel, closePanel, togglePanel }
}
