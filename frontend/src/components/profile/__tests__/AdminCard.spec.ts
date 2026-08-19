import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { ApiError } from '@/api/client'
import BkUser from '@/lib/BkUser.vue'
import AdminCard from '../AdminCard.vue'

vi.mock('@/api/backup', () => ({
  BACKUP_EXPORT_URL: '/api/v1/backup/export',
  restoreBackup: vi.fn(() => Promise.resolve({ restored: true, workouts: 3, previous_revision: 'abc123' })),
}))

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
    username: body.username ?? (id === 1 ? 'admin' : 'user2'),
    is_admin: body.is_admin || false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
    color: body.color ?? null,
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

  // item 6 (v0.4.0): usersReady/invitesReady se fusionaron en una única
  // bandera `ready` — antes cada tabla se destapaba por separado (la de
  // usuarios primero, la de invitaciones ~100ms después), empujando el
  // layout. Ahora TODO el cuerpo async de la card (ambas tablas) aparece de
  // una vez, completo, aunque una de las dos APIs resuelva antes que la otra.
  // item 2/3 (v0.4.3, zurdi): el gate-a-blanco se reemplaza por esqueletos
  // shimmer (mismo hueco que las filas reales) — ya no "nada" mientras
  // carga, y ambos esqueletos se retiran juntos al resolver, igual que antes
  // hacían las tablas reales.
  it('gates the WHOLE admin body on a single readiness flag: skeletons show (no table, no empty states) while either adminListUsers or adminListInvites is pending; both real sections appear together once BOTH resolve', async () => {
    const { adminListUsers, adminListInvites } = await import('@/api/domain')
    let resolveUsers: (value: never) => void = () => {}
    let resolveInvites: (value: never) => void = () => {}
    vi.mocked(adminListUsers).mockImplementationOnce(() => new Promise((resolve) => { resolveUsers = resolve }))
    vi.mocked(adminListInvites).mockImplementationOnce(() => new Promise((resolve) => { resolveInvites = resolve }))

    const wrapper = build()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="admin-users-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="admin-invites-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin usuarios aún')
    expect(wrapper.find('[data-testid^="invite-row-"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin invitaciones aún')

    // usuarios resuelve primero: la tabla SIGUE sin aparecer (invites aún pendiente)
    resolveUsers([
      { id: 1, username: 'admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' },
    ] as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="invite-row-"]').exists()).toBe(false)

    // invites resuelve después: AHORA ambas aparecen juntas, de golpe, y los esqueletos se retiran
    resolveInvites([
      { id: 1, created_at: '2026-08-06T10:00:00', expires_at: '2026-08-09T10:00:00', used_at: null },
    ] as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="admin-users-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-invites-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.text()).toContain('admin')
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

  it('item 5: each user row renders through BkUser (color dot + username), with the admin star composed alongside it, not inside it', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const adminRow = wrapper.get('[data-testid="user-row-1"]')
    const bkUser = adminRow.getComponent(BkUser)
    expect(bkUser.props('user')).toMatchObject({ username: 'admin' })
    expect(bkUser.find('[data-testid="bk-user-dot"]').exists()).toBe(true)
    // la estrella vive FUERA del propio BkUser (dato de rol de esta tabla, no del usuario)
    expect(bkUser.find('[data-testid="admin-badge"]').exists()).toBe(false)
    expect(adminRow.find('[data-testid="admin-badge"]').exists()).toBe(true)
  })

  it('item 3a/3b: action buttons are right-aligned and reset-password shows a key SVG icon, not a glyph', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // 3a: la celda de acciones alinea su contenido a la derecha
    const actionsCell = wrapper.find('[data-testid="reset-password-btn"]').element.closest('td')!
    const actionsWrapper = actionsCell.querySelector('div')!
    expect(actionsWrapper.className).toContain('justify-end')

    // 3b: icono SVG (llave), no el glifo de texto anterior
    const resetBtn = wrapper.find('[data-testid="reset-password-btn"]')
    expect(resetBtn.find('svg').exists()).toBe(true)
    expect(resetBtn.text()).not.toContain('⟳')
    expect(resetBtn.attributes('aria-label')).toBe('Restablecer contraseña')
  })

  it('hides delete and reset buttons on own row (id=1), but keeps the edit pencil available for self too', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Own row (id=1) should have no delete button
    const ownRow = wrapper.find('[data-testid="user-row-1"]')
    const deleteInOwnRow = ownRow.find('[data-testid="delete-user-btn"]')
    expect(deleteInOwnRow.exists()).toBe(false)
    // item (v0.4.0): editar el propio nombre/color SÍ sigue disponible —
    // solo el checkbox de admin se oculta DENTRO del sheet (ver más abajo)
    expect(ownRow.find('[data-testid="edit-user-btn"]').exists()).toBe(true)

    // Other row (id=2) should have delete button
    const otherRow = wrapper.find('[data-testid="user-row-2"]')
    const deleteInOtherRow = otherRow.find('[data-testid="delete-user-btn"]')
    expect(deleteInOtherRow.exists()).toBe(true)
  })

  // v0.17.0 act-as: "entrar como" existe en las filas ajenas, nunca en la
  // propia (actuar como uno mismo no significa nada)
  it('shows the act-as button on other rows only', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(wrapper.find('[data-testid="user-row-1"]').find('[data-testid="act-as-user-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="user-row-2"]').find('[data-testid="act-as-user-btn"]').exists()).toBe(true)
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

  // item (v0.4.0): "desde el admin no se puede editar un user, solo cambiar
  // la contraseña" — nombre/color/admin ahora se editan en un sheet unificado
  describe('edit user sheet', () => {
    it('the pencil pre-fills the sheet from the row (username, color, admin checkbox), then submit calls adminUpdateUser with the full payload', async () => {
      const { adminUpdateUser } = await import('@/api/domain')
      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const otherRow = wrapper.get('[data-testid="user-row-2"]')
      await otherRow.get('[data-testid="edit-user-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      const usernameInput = document.querySelector('[data-testid="edit-username-field"] input') as HTMLInputElement
      expect(usernameInput).not.toBeNull()
      expect(usernameInput.value).toBe('user2') // pre-fill desde la fila

      const adminCheckbox = document.querySelector('[data-testid="edit-is-admin-checkbox"]') as HTMLButtonElement
      expect(adminCheckbox).not.toBeNull()
      expect(adminCheckbox.getAttribute('aria-checked')).toBe('false') // user2 no es admin

      usernameInput.value = 'user2renamed'
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }))

      // color: el segundo swatch de la paleta (el primero es el botón "default")
      const swatchButtons = document.querySelectorAll('[data-testid="color-swatch"]')
      expect(swatchButtons.length).toBeGreaterThan(0)
      const pickedSwatch = (swatchButtons[0] as HTMLElement).getAttribute('aria-label')
      swatchButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))

      adminCheckbox.click()
      await wrapper.vm.$nextTick()

      const submitBtn = document.querySelector('[data-testid="save-edit-user-btn"]') as HTMLElement
      expect(submitBtn).not.toBeNull()
      submitBtn.click()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(adminUpdateUser).toHaveBeenCalledWith(2, {
        username: 'user2renamed',
        color: pickedSwatch,
        is_admin: true,
      })

      // tras el éxito, el sheet se cierra
      await wrapper.vm.$nextTick()
      expect(document.querySelector('[data-testid="edit-username-field"] input')).toBeNull()
    })

    it('a username collision shows the inline error, the same as the create-user flow, instead of a generic toast', async () => {
      const { adminUpdateUser } = await import('@/api/domain')
      vi.mocked(adminUpdateUser).mockRejectedValueOnce(new ApiError(409, 'username_taken'))

      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const otherRow = wrapper.get('[data-testid="user-row-2"]')
      await otherRow.get('[data-testid="edit-user-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      const usernameInput = document.querySelector('[data-testid="edit-username-field"] input') as HTMLInputElement
      usernameInput.value = 'admin'
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }))

      const submitBtn = document.querySelector('[data-testid="save-edit-user-btn"]') as HTMLElement
      submitBtn.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      const fieldEl = document.querySelector('[data-testid="edit-username-field"]') as HTMLElement
      expect(fieldEl.textContent).toContain('Ese usuario ya existe.')
      // el sheet se queda abierto (no se cierra en error)
      expect(document.querySelector('[data-testid="edit-username-field"] input')).not.toBeNull()
    })

    it("self-row protection: editing your OWN row hides the admin checkbox entirely (can't self-demote from the sheet)", async () => {
      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const ownRow = wrapper.get('[data-testid="user-row-1"]')
      await ownRow.get('[data-testid="edit-user-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(document.querySelector('[data-testid="edit-username-field"] input')).not.toBeNull()
      expect(document.querySelector('[data-testid="edit-is-admin-checkbox"]')).toBeNull()
    })

    it('the password-reset action stays as its own row icon and sheet, untouched by the edit sheet', async () => {
      const { adminUpdateUser } = await import('@/api/domain')
      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const otherRow = wrapper.get('[data-testid="user-row-2"]')
      // el sheet de editar no trae ningún campo de contraseña
      await otherRow.get('[data-testid="edit-user-btn"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.querySelector('[data-testid="edit-username-field"]')).not.toBeNull()
      expect(document.querySelector('input[type="password"]')).toBeNull()
      document.querySelector<HTMLElement>('[data-testid="save-edit-user-btn"]')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(adminUpdateUser).not.toHaveBeenCalledWith(2, expect.objectContaining({ password: expect.anything() }))
    })
  })

  describe('backup', () => {
    function selectRestoreFile(file: File) {
      const input = document.querySelector('[data-testid="restore-backup-input"]') as HTMLInputElement
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    it('renders a real download link for the backup export pointing at the API URL', async () => {
      const w = build()
      await w.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      const link = w.find('[data-testid="export-backup-link"]')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('/api/v1/backup/export')
      expect(link.attributes('download')).toBe('')
    })

    it('clicking "Restaurar copia" opens the native file picker (click on the hidden input)', async () => {
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click')
      const w = build()
      await w.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      await w.find('[data-testid="restore-backup-btn"]').trigger('click')

      expect(clickSpy).toHaveBeenCalled()
      clickSpy.mockRestore()
    })

    it('selecting a .zip file opens the restore confirmation sheet with the destructive hint', async () => {
      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      // se busca por el botón de cancelar propio del sheet de restore, no por
      // [role="dialog"] a secas: otros tests de este fichero teletransportan
      // sus propios sheets a document.body (Teleport ignora el attachTo del
      // wrapper) y nunca los desmontan, así que un selector genérico picaría
      // diálogos ajenos que quedaron colgando de tests anteriores
      expect(document.querySelector('[data-testid="restore-backup-cancel-btn"]')).toBeNull()

      const file = new File(['zip-bytes'], 'backup.zip', { type: 'application/zip' })
      selectRestoreFile(file)
      await wrapper.vm.$nextTick()

      const cancelBtn = document.querySelector('[data-testid="restore-backup-cancel-btn"]')
      expect(cancelBtn).not.toBeNull()
      const dialog = cancelBtn!.closest('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog!.textContent).toContain('reemplaza todos los datos actuales')
    })

    it('canceling the restore confirmation does not call restoreBackup and closes the sheet', async () => {
      const { restoreBackup } = await import('@/api/backup')
      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      const file = new File(['zip-bytes'], 'backup.zip', { type: 'application/zip' })
      selectRestoreFile(file)
      await wrapper.vm.$nextTick()

      const cancelBtn = document.querySelector('[data-testid="restore-backup-cancel-btn"]') as HTMLElement
      expect(cancelBtn).not.toBeNull()
      cancelBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      expect(restoreBackup).not.toHaveBeenCalled()
      expect(document.querySelector('[data-testid="restore-backup-cancel-btn"]')).toBeNull()
    })

    it('confirming restore calls restoreBackup with the selected file, toasts success and reloads the page', async () => {
      const { restoreBackup } = await import('@/api/backup')
      const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
      const toastStore = useToastStore()

      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      const file = new File(['zip-bytes'], 'backup.zip', { type: 'application/zip' })
      selectRestoreFile(file)
      await wrapper.vm.$nextTick()

      const confirmBtn = document.querySelector('[data-testid="restore-backup-confirm-btn"]') as HTMLElement
      expect(confirmBtn).not.toBeNull()
      confirmBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      expect(restoreBackup).toHaveBeenCalledWith(file)
      expect(reloadSpy).toHaveBeenCalled()
      expect(toastStore.toasts.at(-1)?.kind).toBe('info')
      expect(toastStore.toasts.at(-1)?.message).toBe('Copia restaurada. Recargando…')

      reloadSpy.mockRestore()
    })

    it('shows an error toast and does not reload when restoreBackup rejects with an ApiError', async () => {
      const { restoreBackup } = await import('@/api/backup')
      vi.mocked(restoreBackup).mockImplementationOnce(() => Promise.reject(new ApiError(400, 'backup_invalid')))
      const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
      const toastStore = useToastStore()

      wrapper = mount(AdminCard, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      const file = new File(['zip-bytes'], 'backup.zip', { type: 'application/zip' })
      selectRestoreFile(file)
      await wrapper.vm.$nextTick()

      const confirmBtn = document.querySelector('[data-testid="restore-backup-confirm-btn"]') as HTMLElement
      confirmBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      expect(reloadSpy).not.toHaveBeenCalled()
      expect(toastStore.toasts.at(-1)?.kind).toBe('error')
      expect(toastStore.toasts.at(-1)?.message).toBe('El fichero de copia no es válido.')

      reloadSpy.mockRestore()
    })
  })
})
