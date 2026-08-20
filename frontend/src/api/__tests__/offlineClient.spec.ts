import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError, OfflineError } from '../client'
import { online } from '@/offline/net'

// v0.6.0 offline: el cliente HTTP con la cache de lecturas — cada GET bueno
// se guarda, y un GET que muere por red se sirve de lo último visto
function mockFetchOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )))
}

function mockFetchNetworkDeath() {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  }))
}

// entorno de este repo: el localStorage global es un stub roto de Node —
// mismo mock en memoria que athlete.spec.ts/uiPrefs.spec.ts
function mockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  } as Storage
}

describe('api client offline behavior', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockStorage())
    online.value = true
  })
  afterEach(() => vi.unstubAllGlobals())

  it('serves the last good GET from cache when the network dies, and flags offline', async () => {
    mockFetchOk({ id: 4, feeling: 5 })
    const first = await api<{ id: number }>('/workouts/active')
    expect(first.id).toBe(4)

    mockFetchNetworkDeath()
    const cached = await api<{ id: number }>('/workouts/active')
    expect(cached).toEqual({ id: 4, feeling: 5 })
    expect(online.value).toBe(false)
  })

  it('a GET with no cache propagates OfflineError', async () => {
    mockFetchNetworkDeath()
    await expect(api('/never-seen')).rejects.toBeInstanceOf(OfflineError)
  })

  it('a mutation never falls back to cache: network death is OfflineError', async () => {
    mockFetchOk({ id: 4 })
    await api('/workouts/active') // siembra cache en otra ruta
    mockFetchNetworkDeath()
    await expect(api('/workouts', { method: 'POST', body: {} })).rejects.toBeInstanceOf(OfflineError)
  })

  it('a real HTTP error still proves the server is there: marks online and throws ApiError', async () => {
    online.value = false
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'not_found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )))
    await expect(api('/workouts/999')).rejects.toBeInstanceOf(ApiError)
    expect(online.value).toBe(true)
  })
})

// v0.34.0: una petición que no contesta (red "a medias") no puede quedarse
// colgada — el timeout la convierte en OfflineError y marca offline
describe('timeout del cliente', () => {
  it('una petición colgada salta a OfflineError a los 8 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const { api, OfflineError } = await import('../client')
    const { online } = await import('@/offline/net')
    const pending = api('/workouts/1/exercises', { method: 'POST', body: { exercise_id: 1 } })
    const outcome = pending.then(() => 'resolved', (error: unknown) => error)
    await vi.advanceTimersByTimeAsync(8_100)
    expect(await outcome).toBeInstanceOf(OfflineError)
    expect(online.value).toBe(false)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
