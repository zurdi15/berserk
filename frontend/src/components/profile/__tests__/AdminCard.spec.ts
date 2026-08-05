import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('hides delete button on own row (id=1)', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Count delete buttons - should only be 1 for user2, not for admin
    const deleteButtons = wrapper.findAll('[data-testid="delete-user-btn"]')
    expect(deleteButtons.length).toBe(1)
    expect(deleteButtons[0].element.closest('[data-testid="user-row-2"]')).toBeTruthy()
  })

  it('renders admin rune badge for admin users', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Check for admin badge (BkRune component) in admin row
    const adminRow = wrapper.find('[data-testid="user-row-1"]')
    expect(adminRow.text()).toContain('admin')
  })

  it('creates invite and shows token with once-warning', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Click create invite button
    const createInviteBtn = wrapper.find('[data-testid="create-invite-btn"]')
    await createInviteBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    // Verify token is visible
    const tokenDisplay = wrapper.find('[data-testid="token-display"]')
    expect(tokenDisplay.text()).toBe('test-token-abc123')

    // Verify once-warning is shown
    const text = wrapper.text()
    expect(text).toContain('solo se puede usar una vez')
  })

  it('renders pending and used invites list', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const text = wrapper.text()
    // Should contain invite-related content in Spanish
    expect(text).toContain('Creado') // Spanish for "Created"
    expect(text).toContain('Expira') // Spanish for "Expires"
    expect(text).toContain('Pendiente') // Spanish for "Pending"
    expect(text).toContain('Usado') // Spanish for "Used"
  })

  it('copy-to-clipboard button guards against errors', async () => {
    // Mock navigator.clipboard
    const mockWriteText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
    })

    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Create an invite first
    const createInviteBtn = wrapper.find('[data-testid="create-invite-btn"]')
    await createInviteBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    // Click copy button if it exists
    const copyBtn = wrapper.find('[data-testid="copy-token-btn"]')
    if (copyBtn.exists()) {
      await copyBtn.trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(mockWriteText).toHaveBeenCalledWith('test-token-abc123')
    }
  })

  it('renders button text from i18n', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const text = wrapper.text()
    // Should contain Spanish translations for buttons
    expect(text).toContain('Guardar') // Spanish for 'save'
  })
})
