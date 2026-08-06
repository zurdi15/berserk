import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { UserOut } from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import AthleteBanner from '../AthleteBanner.vue'

const ATHLETE: UserOut = { id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC', color: '#7C8FFF' }

function build() {
  return mount(AthleteBanner, { global: { plugins: [createI18nInstance()] } })
}

describe('AthleteBanner', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stays hidden when not viewing another athlete', () => {
    const wrapper = build()
    expect(wrapper.find('[data-testid="athlete-banner"]').exists()).toBe(false)
  })

  it('shows the viewed athlete name once viewing starts', async () => {
    const athlete = useAthleteStore()
    const wrapper = build()

    athlete.view(ATHLETE)
    await flushPromises()

    const banner = wrapper.find('[data-testid="athlete-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('freyja')

    const dot = wrapper.find('[data-testid="athlete-banner-dot"]')
    expect(dot.exists()).toBe(true)
    expect((dot.element as HTMLElement).style.backgroundColor).toBe('#7C8FFF')
  })

  it('falls back to the theme aurora when the viewed athlete has no color of their own', async () => {
    const athlete = useAthleteStore()
    const wrapper = build()

    athlete.view({ ...ATHLETE, color: null })
    await flushPromises()

    const dot = wrapper.find('[data-testid="athlete-banner-dot"]')
    expect((dot.element as HTMLElement).style.backgroundColor).toBe('var(--bk-accent-aurora)')
  })

  it('dismissing via the stop button clears viewing and hides the banner', async () => {
    const athlete = useAthleteStore()
    athlete.view(ATHLETE)
    const wrapper = build()
    await flushPromises()

    await wrapper.find('[data-testid="athlete-banner-stop"]').trigger('click')
    await flushPromises()

    expect(athlete.isViewing).toBe(false)
    expect(wrapper.find('[data-testid="athlete-banner"]').exists()).toBe(false)
  })
})
