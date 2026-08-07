import { onMounted, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// item 1 (v0.3.2): ancla la pestaña activa de una vista con pestañas
// (Perfil, Progresión) al hash de la URL — refrescar o compartir el enlace
// vuelve a la MISMA pestaña, y atrás/adelante del navegador las recorre.
// router.replace (nunca push): un tap de pestaña no debe apilar historial,
// solo la navegación real entre vistas lo hace.
//
// validTabs es una FUNCIÓN, no un array estático: en Perfil la lista
// depende de auth.user.is_admin, evaluado de nuevo en cada llamada — un
// hash #admin de un no-admin (o cualquier hash basura) cae al default.
export function useTabHash<T extends string>(defaultTab: T, validTabs: () => readonly T[]): Ref<T> {
  const route = useRoute()
  const router = useRouter()

  function tabFromHash(hash: string): T {
    const value = hash.replace(/^#/, '') as T
    return validTabs().includes(value) ? value : defaultTab
  }

  const activeTab = ref(tabFromHash(route.hash)) as Ref<T>

  // atrás/adelante del navegador (o cualquier cambio de hash externo): el
  // hash es la fuente de verdad, activeTab se resincroniza desde él
  watch(
    () => route.hash,
    (hash) => {
      activeTab.value = tabFromHash(hash)
    },
  )

  // tap de pestaña: activeTab es la fuente de verdad, el hash se sincroniza
  // hacia la URL. El guard evita un replace redundante cuando este cambio
  // vino AL REVÉS (del watcher de arriba, tras un cambio de hash externo:
  // para entonces route.hash ya coincide con el nuevo valor)
  watch(activeTab, (value) => {
    const hash = `#${value}`
    if (route.hash !== hash) router.replace({ hash })
  })

  // corrige la URL si el hash inicial no era válido (basura, o #admin para
  // un no-admin) — así la barra de direcciones siempre refleja la pestaña
  // real, no un hash que la vista rechazó en silencio
  onMounted(() => {
    const hash = `#${activeTab.value}`
    if (route.hash !== hash) router.replace({ hash })
  })

  return activeTab
}
