import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import AdminCard from '../AdminCard.vue'

vi.mock('@/api/domain', () => ({
  adminListUsers: vi.fn(() => Promise.resolve([
    { id: 1, username: 'admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' },
    { id: 2, username: 'user2', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' },
  ])),
  adminCreateUser: vi.fn((body) => Promise.resolve({
    id: 3,
    username: body.username,
    is_admin: body.is_admin || false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
  })),
  adminUpdateUser: vi.fn((id, body) => Promise.resolve({
    id,
    username: id === 1 ? 'admin' : 'user2',
    is_admin: body.is_admin || false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
  })),
  adminDeleteUser: vi.fn(() => Promise.resolve()),
  adminCreateInvite: vi.fn(() => Promise.resolve({
    token: 'test-token-abc123',
  })),
  adminListInvites: vi.fn(() => Promise.resolve([
    {
      id: 1,
      created_at: '2026-08-06T10:00:00',
      expires_at: '2026-08-09T10:00:00',
      used_at: null,
    },
    {
      id: 2,
      created_at: '2026-08-05T10:00:00',
      expires_at: '2026-08-08T10:00:00',
      used_at: '2026-08-06T15:30:00',
    },
  ])),
  adminDeleteInvite: vi.fn(() => Promise.resolve()),
}))

describe('AdminCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      username: 'admin',
      is_admin: true,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
    }
    vi.clearAllMocks()
  })

  // solo la usa el test del dialog de "crear usuario" (teleport pattern):
  // build() no la toca, así que el afterEach es un no-op para el resto
  let wrapper: VueWrapper | null = null
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  function build() {
    return mount(AdminCard, {
      global: {
        plugins: [createI18nInstance()],
      },
    })
  }

  it('renders users table with usernames', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const text = wrapper.text()
    expect(text).toContain('admin')
    expect(text).toContain('user2')
  })

  it('gates the users table on readiness: neither the table nor "sin usuarios" show while adminListUsers is pending, the table appears once resolved', async () => {
    const { adminListUsers } = await import('@/api/domain')
    let resolveUsers: (value: never) => void = () => {}
    vi.mocked(adminListUsers).mockImplementationOnce(() => new Promise((resolve) => { resolveUsers = resolve }))

    const wrapper = build()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin usuarios aún')

    resolveUsers([
      { id: 1, username: 'admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' },
    ] as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.text()).toContain('admin')
  })

  it('gates the invites list on readiness: neither the list nor "sin invitaciones" show while adminListInvites is pending, the list appears once resolved', async () => {
    const { adminListInvites } = await import('@/api/domain')
    let resolveInvites: (value: never) => void = () => {}
    vi.mocked(adminListInvites).mockImplementationOnce(() => new Promise((resolve) => { resolveInvites = resolve }))

    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0)) // deja resolver loadUsers (no bloqueado)

    expect(wrapper.find('[data-testid^="invite-row-"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin invitaciones aún')

    resolveInvites([
      { id: 1, created_at: '2026-08-06T10:00:00', expires_at: '2026-08-09T10:00:00', used_at: null },
    ] as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="invite-row-1"]').exists()).toBe(true)
  })

  it('shows the admin star (with its accessible label) for admin users only, no separate column', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // sin columna "Administrador": la tabla solo tiene usuario + acciones (sr-only)
    const headers = wrapper.findAll('th')
    expect(headers).toHaveLength(2)
    expect(wrapper.find('thead').text()).not.toContain('Administrador')

    const adminRow = wrapper.find('[data-testid="user-row-1"]')
    const badgeInAdminRow = adminRow.find('[data-testid="admin-badge"]')
    expect(badgeInAdminRow.exists()).toBe(true)
    expect(badgeInAdminRow.classes()).toContain('text-aurora')
    expect(badgeInAdminRow.classes()).toContain('font-semibold')
    expect(badgeInAdminRow.text()).toContain('✦')
    expect(badgeInAdminRow.find('.sr-only').text()).toBe('Administrador') // mismo texto que admin.isAdmin

    const nonAdminRow = wrapper.find('[data-testid="user-row-2"]')
    const badgeInNonAdminRow = nonAdminRow.find('[data-testid="admin-badge"]')
    expect(badgeInNonAdminRow.exists()).toBe(false)
  })

  it('hides delete and reset buttons on own row (id=1)', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Own row (id=1) should have no delete button
    const ownRow = wrapper.find('[data-testid="user-row-1"]')
    const deleteInOwnRow = ownRow.find('[data-testid="delete-user-btn"]')
    expect(deleteInOwnRow.exists()).toBe(false)

    // Other row (id=2) should have delete button
    const otherRow = wrapper.find('[data-testid="user-row-2"]')
    const deleteInOtherRow = otherRow.find('[data-testid="delete-user-btn"]')
    expect(deleteInOtherRow.exists()).toBe(true)
  })

  it('clicking delete user opens confirmation sheet', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Check initial state
    expect((wrapper.vm as any).deleteUserConfirmOpen).toBe(false)

    const deleteBtn = wrapper.find('[data-testid="delete-user-btn"]')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Verify the sheet is now open
    expect((wrapper.vm as any).deleteUserConfirmOpen).toBe(true)
    expect((wrapper.vm as any).deleteUserId).toBe(2)
  })

  it('confirming user delete calls adminDeleteUser with correct id', async () => {
    const { adminDeleteUser } = await import('@/api/domain')
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const deleteBtn = wrapper.find('[data-testid="delete-user-btn"]')
    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Call confirmDeleteUser directly on the component
    await (wrapper.vm as any).confirmDeleteUser()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(adminDeleteUser).toHaveBeenCalledWith(2)
  })

  it('canceling user delete does not call adminDeleteUser', async () => {
    const { adminDeleteUser } = await import('@/api/domain')
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const deleteBtn = wrapper.find('[data-testid="delete-user-btn"]')
    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Close sheet without confirming
    const vm = wrapper.vm as any
    vm.deleteUserConfirmOpen = false
    await wrapper.vm.$nextTick()

    expect(adminDeleteUser).not.toHaveBeenCalled()
  })

  it('creates invite and shows token with once-warning', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const createInviteBtn = wrapper.find('[data-testid="create-invite-btn"]')
    await createInviteBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    const tokenDisplay = wrapper.find('[data-testid="token-display"]')
    expect(tokenDisplay.text()).toBe('test-token-abc123')

    const text = wrapper.text()
    expect(text).toContain('solo se puede usar una vez')
  })

  it('copy-to-clipboard calls navigator.clipboard.writeText with token', async () => {
    const mockWriteText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    })

    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const createInviteBtn = wrapper.find('[data-testid="create-invite-btn"]')
    await createInviteBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    const copyBtn = wrapper.find('[data-testid="copy-token-btn"]')
    expect(copyBtn.exists()).toBe(true)

    await copyBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    // el token bare no lleva a ningún sitio: el botón copia la URL de canje completa
    expect(mockWriteText).toHaveBeenCalledWith(`${window.location.origin}/invite/test-token-abc123`)
  })

  it('handles missing clipboard gracefully without crashing', async () => {
    // Stub navigator.clipboard as undefined
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const createInviteBtn = wrapper.find('[data-testid="create-invite-btn"]')
    await createInviteBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    const copyBtn = wrapper.find('[data-testid="copy-token-btn"]')
    expect(copyBtn.exists()).toBe(true)

    // Should not throw
    await copyBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    // Restore
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    })
  })

  it('renders pending and used invites list', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const text = wrapper.text()
    expect(text).toContain('Creado')
    expect(text).toContain('Expira')
    expect(text).toContain('Pendiente')
    expect(text).toContain('Usado')
  })

  it('clicking delete invite opens confirmation sheet', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Check initial state
    expect((wrapper.vm as any).deleteInviteConfirmOpen).toBe(false)

    const deleteInviteBtn = wrapper.find('[data-testid="delete-invite-btn"]')
    expect(deleteInviteBtn.exists()).toBe(true)
    await deleteInviteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Verify the sheet is now open
    expect((wrapper.vm as any).deleteInviteConfirmOpen).toBe(true)
    expect((wrapper.vm as any).deleteInviteId).toBe(1)
  })

  it('confirming invite delete calls adminDeleteInvite with correct id', async () => {
    const { adminDeleteInvite } = await import('@/api/domain')
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const deleteInviteBtn = wrapper.find('[data-testid="delete-invite-btn"]')
    await deleteInviteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Call confirmDeleteInvite directly on the component
    await (wrapper.vm as any).confirmDeleteInvite()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(adminDeleteInvite).toHaveBeenCalledWith(1)
  })

  it('canceling invite delete does not call adminDeleteInvite', async () => {
    const { adminDeleteInvite } = await import('@/api/domain')
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const deleteInviteBtn = wrapper.find('[data-testid="delete-invite-btn"]')
    await deleteInviteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Close sheet without confirming
    const vm = wrapper.vm as any
    vm.deleteInviteConfirmOpen = false
    await wrapper.vm.$nextTick()

    expect(adminDeleteInvite).not.toHaveBeenCalled()
  })

  it('renders button text from i18n', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // "Guardar" ahora vive dentro del sheet de crear usuario, cerrado por
    // defecto (item 9) — el botón que SIEMPRE está visible es el que lo abre
    const text = wrapper.text()
    expect(text).toContain('Crear usuario')
  })

  it('create user (item 9, dialog flow): open button → sheet opens → fill form → submit → adminCreateUser called with full payload', async () => {
    const { adminCreateUser } = await import('@/api/domain')
    wrapper = mount(AdminCard, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // el dialog empieza cerrado: sin form visible hasta abrirlo
    expect(document.querySelector('[data-testid="create-username-field"] input')).toBeNull()

    const openBtn = wrapper.find('[data-testid="open-create-user-btn"]')
    expect(openBtn.exists()).toBe(true)
    await openBtn.trigger('click')
    await wrapper.vm.$nextTick()

    const usernameInput = document.querySelector('[data-testid="create-username-field"] input') as HTMLInputElement
    expect(usernameInput).not.toBeNull()
    usernameInput.value = 'newbie'
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }))

    const passwordInput = document.querySelector('[data-testid="create-password-field"] input') as HTMLInputElement
    expect(passwordInput).not.toBeNull()
    passwordInput.value = 'hunter22'
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }))

    const adminCheckbox = document.querySelector('[data-testid="create-is-admin-checkbox"]') as HTMLInputElement
    expect(adminCheckbox).not.toBeNull()
    adminCheckbox.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const submitBtn = document.querySelector('[data-testid="create-user-btn"]') as HTMLElement
    expect(submitBtn).not.toBeNull()
    submitBtn.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(adminCreateUser).toHaveBeenCalledWith({
      username: 'newbie',
      password: 'hunter22',
      is_admin: true,
    })

    // tras el éxito, el dialog se cierra y el form ya no está en el DOM
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[data-testid="create-username-field"] input')).toBeNull()
  })
})
