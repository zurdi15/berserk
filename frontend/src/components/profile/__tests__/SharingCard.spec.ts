import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import BkUser from '@/lib/BkUser.vue'
import SharingCard from '../SharingCard.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/api/domain', () => ({
  getSharing: vi.fn(() => Promise.resolve({
    given: [
      { id: 2, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' },
    ],
    received: [
      { id: 3, username: 'freyr', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC', color: '#7C8FFF' },
    ],
  })),
  revokeSharing: vi.fn(() => Promise.resolve()),
  grantSharing: vi.fn((username: string) => Promise.resolve({
    id: 4,
    username,
    is_admin: false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
  })),
  // item 11: freyja (id 2) ya está en givenUsers -> el picker debe excluirla
  listUserDirectory: vi.fn(() => Promise.resolve([
    { id: 2, username: 'freyja', color: null },
    { id: 5, username: 'loki', color: '#abc123' },
    { id: 6, username: 'sif', color: null },
  ])),
}))

// BkSelect usa <Teleport to="body">: hay que montar sobre document.body y
// buscar ahí dentro (mismo patrón que library.spec.ts)
let mountedWrappers: VueWrapper[] = []

function byTestId(id: string): DOMWrapper<Element> {
  return new DOMWrapper(document.body.querySelector(`[data-testid="${id}"]`) as Element | null)
}

afterEach(() => {
  mountedWrappers.forEach((wrapper) => wrapper.unmount())
  mountedWrappers = []
})

describe('SharingCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function build() {
    const wrapper = mount(SharingCard, {
      global: {
        plugins: [createI18nInstance()],
      },
      attachTo: document.body,
    })
    mountedWrappers.push(wrapper)
    return wrapper
  }

  it('renders given and received users from getSharing', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify the component renders sections for given and received sharing
    const givenSection = wrapper.text()
    expect(givenSection).toContain('freyja')
    expect(givenSection).toContain('freyr')
  })

  it('gates both lists on readiness: neither the "nobody" message nor real rows show while getSharing is pending, both appear once resolved', async () => {
    const { getSharing } = await import('@/api/domain')
    let resolveSharing: (value: never) => void = () => {}
    vi.mocked(getSharing).mockImplementationOnce(() => new Promise((resolve) => { resolveSharing = resolve }))

    const wrapper = build()
    await wrapper.vm.$nextTick()

    // pendiente: ni el mensaje de "nadie" ni una fila de usuario real
    expect(wrapper.text()).not.toContain('No compartes con nadie')
    expect(wrapper.text()).not.toContain('Nadie te comparte datos')
    expect(wrapper.find('[data-testid="revoke-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="view-user-btn"]').exists()).toBe(false)

    resolveSharing({
      given: [{ id: 2, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' }],
      received: [],
    } as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('freyja')
    expect(wrapper.text()).toContain('Nadie te comparte datos') // received sigue vacío, ya resuelto
  })

  it('clicking ver on a received user sets athlete store and navigates', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Find and click the "ver" button for a received user
    const verButtons = wrapper.findAll('[data-testid="view-user-btn"]')
    expect(verButtons).toHaveLength(1)
    await verButtons[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Verify athlete store was updated
    const athlete = useAthleteStore()
    expect(athlete.viewing).not.toBeNull()
    expect(athlete.viewing?.username).toBe('freyr')
    expect(athlete.viewing?.color).toBe('#7C8FFF')

    // Verify router navigation
    expect(push).toHaveBeenCalledWith({ name: 'today' })
  })

  // item 5 (v0.4.0): el punto de color ahora vive dentro de BkUser
  // (data-testid="bk-user-dot"), no de un span propio de SharingCard
  it('shows a color dot next to each user shared with me', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const dots = wrapper.findAll('[data-testid="bk-user-dot"]')
    // una por CADA usuario renderizado (given + received): freyja + freyr
    expect(dots).toHaveLength(2)
    const freyrDot = wrapper.findAllComponents(BkUser).find((c) => c.props('user').username === 'freyr')!
    expect((freyrDot.get('[data-testid="bk-user-dot"]').element as HTMLElement).style.backgroundColor).toBe(
      '#7C8FFF',
    )
  })

  it('item 5: both lists render through BkUser (color dot + username)', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const users = wrapper.findAllComponents(BkUser).map((c) => c.props('user').username)
    expect(users).toEqual(['freyja', 'freyr'])
  })

  it('item 5: revoke and view render as icon-only BkActionBtn with the correct icon and accessible label (aria-label from existing i18n keys)', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const revokeBtn = wrapper.get('[data-testid="revoke-btn"]')
    expect(revokeBtn.attributes('aria-label')).toBe('Borrar')
    expect(revokeBtn.find('svg').exists()).toBe(true)
    expect(revokeBtn.text()).not.toContain('Borrar') // icon-only: sin texto visible

    const viewBtn = wrapper.get('[data-testid="view-user-btn"]')
    expect(viewBtn.attributes('aria-label')).toBe('Ver')
    expect(viewBtn.find('ellipse').exists()).toBe(true) // icono "view" de BkActionBtn
    expect(viewBtn.text()).not.toContain('Ver')
  })

  it('revoke button triggers confirmation sheet', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Trigger revoke on first user
    const revokeButtons = wrapper.findAll('[data-testid="revoke-btn"]')
    expect(revokeButtons).toHaveLength(1)
    await revokeButtons[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Verify sheet exists
    const sheet = wrapper.findComponent({ name: 'BkSheet' })
    expect(sheet.exists()).toBe(true)
  })

  describe('item 11: grant access picker (not a username textfield)', () => {
    it('offers the directory, excluding users already granted access (freyja, id 2)', async () => {
      const wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid="grant-username-field"]').exists()).toBe(false)
      await wrapper.get('[data-testid="grant-user-select"] [role="combobox"]').trigger('click')

      const options = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim())
      expect(options).toEqual(['loki', 'sif'])
    })

    it('DOM-real: open, pick a user, grant is called with the username (existing API contract, unchanged)', async () => {
      const { grantSharing } = await import('@/api/domain')
      const wrapper = build()
      await flushPromises()

      await wrapper.get('[data-testid="grant-user-select"] [role="combobox"]').trigger('click')
      const lokiOption = Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => o.textContent?.trim() === 'loki') as HTMLElement
      expect(lokiOption).not.toBeUndefined()
      lokiOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      await byTestId('grant-btn').trigger('click')
      await flushPromises()

      expect(grantSharing).toHaveBeenCalledWith('loki')
    })

    it('shows a "no one left to grant to" message instead of the picker when the directory has no candidates', async () => {
      const { listUserDirectory } = await import('@/api/domain')
      vi.mocked(listUserDirectory).mockResolvedValueOnce([
        { id: 2, username: 'freyja', color: null }, // ya concedido: el único del directorio
      ] as never)

      const wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid="grant-user-select"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="no-grantable-users"]').text()).toBe('No hay más usuarios a los que conceder acceso')
    })

    it('does not call grantSharing when nothing is selected', async () => {
      const { grantSharing } = await import('@/api/domain')
      const wrapper = build()
      await flushPromises()

      await byTestId('grant-btn').trigger('click')
      await flushPromises()

      expect(grantSharing).not.toHaveBeenCalled()
    })
  })
})
