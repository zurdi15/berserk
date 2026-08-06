import { computed } from 'vue'

import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'

// unidad de display: la del atleta que se está viendo manda sobre la propia,
// para que un coach lea los pesos en la unidad de quien entrena, no la suya
export function useDisplayUnits() {
  const athlete = useAthleteStore()
  const auth = useAuthStore()
  return computed(() => ((athlete.viewing?.units ?? auth.user?.units ?? 'kg') as 'kg' | 'lb'))
}
