import { ApiError } from './client'

// mismo BASE que client.ts, pero export es una navegación real (anchor
// `download`, no fetch) y restore es multipart: ninguno de los dos encaja
// en el cliente JSON de client.ts
const BASE = '/api/v1'

export const BACKUP_EXPORT_URL = `${BASE}/backup/export`

export interface RestoreResult {
  restored: boolean
  workouts: number
  previous_revision: string | null
}

// FormData no pasa por `api()` (ese cliente siempre serializa el body a
// JSON y fija Content-Type: application/json): un POST multipart necesita
// su propio fetch, con las mismas reglas de error que el resto de la app
// (slug de `detail`, credentials same-origin) para que toastApiError funcione igual.
export async function restoreBackup(file: File): Promise<RestoreResult> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${BASE}/backup/restore`, {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const detail = (payload as { detail?: unknown }).detail
    const slug = typeof detail === 'string' ? detail : 'generic'
    throw new ApiError(response.status, slug)
  }
  return (await response.json()) as RestoreResult
}
