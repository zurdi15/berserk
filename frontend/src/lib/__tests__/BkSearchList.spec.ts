import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkSearchList from '../BkSearchList.vue'

interface Item { id: number; name: string }

const ITEMS: Item[] = [
  { id: 1, name: 'Press banca' },
  { id: 2, name: 'Sentadilla' },
  { id: 3, name: 'Peso muerto' },
  { id: 4, name: 'Press militar' },
]

// BkSearchList es un componente GENÉRICO (script setup generic="T"):
// InstanceType<typeof BkSearchList>['$props'] (el patrón que usa el resto
// de specs de primitivas) no resuelve bien el genérico con vue-tsc, así que
// aquí el tipo de props del helper se declara a mano
interface BuildProps {
  items?: Item[]
  labelFn?: (item: Item) => string
  modelValue?: string
  label?: string
  emptyText?: string
}

function build(props: BuildProps = {}) {
  return mount(BkSearchList<Item>, {
    props: {
      items: ITEMS,
      labelFn: (item: Item) => item.name,
      modelValue: '',
      label: 'Buscar',
      ...props,
    },
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
}

describe('BkSearchList (item 5: primitiva de búsqueda + lista)', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('renders every provided item as a listbox option when the query is empty', () => {
    wrapper = build()
    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(4)
  })

  it('falls back to labelFn text for rows when no #item slot is given', () => {
    wrapper = build()
    expect(wrapper.get('[role="option"]').text()).toBe('Press banca')
  })

  it('renders a custom row via the #item scoped slot instead of the labelFn fallback', () => {
    wrapper = mount(BkSearchList<Item>, {
      props: { items: ITEMS, labelFn: (item: Item) => item.name, modelValue: '', label: 'Buscar' },
      slots: {
        item: '<template #item="{ item }"><span data-testid="custom-row">{{ item.name }} !</span></template>',
      },
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    const rows = wrapper.findAll('[data-testid="custom-row"]')
    expect(rows).toHaveLength(4)
    expect(rows[0].text()).toBe('Press banca !')
  })

  it('filters items case-insensitively by labelFn against modelValue', () => {
    wrapper = build({ modelValue: 'press' })
    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(2)
    expect(options.map((o) => o.text())).toEqual(['Press banca', 'Press militar'])
  })

  it('typing in the input emits update:modelValue with the typed text', async () => {
    wrapper = build()
    const input = wrapper.get('[data-testid="search-list-input"]')
    await input.setValue('senta')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['senta'])
  })

  it('shows the empty-results state when the filter matches nothing', () => {
    wrapper = build({ modelValue: 'nonexistent' })
    expect(wrapper.find('[role="option"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="search-list-empty"]').text()).toBe('Sin resultados')
  })

  it('shows the empty-results state when items itself is empty, even without a query', () => {
    wrapper = build({ items: [] })
    expect(wrapper.find('[data-testid="search-list-empty"]').exists()).toBe(true)
  })

  it('an emptyText override replaces the default i18n empty label', () => {
    wrapper = build({ modelValue: 'nonexistent', emptyText: 'Nada por aquí' })
    expect(wrapper.get('[data-testid="search-list-empty"]').text()).toBe('Nada por aquí')
  })

  it('clicking a row emits select with that item', async () => {
    wrapper = build()
    await wrapper.findAll('[role="option"]')[1].trigger('click')
    expect(wrapper.emitted('select')!.at(-1)).toEqual([ITEMS[1]])
  })

  it('ArrowDown moves the active row (aria-selected) and wraps at the end', async () => {
    wrapper = build()
    const input = wrapper.get('[data-testid="search-list-input"]')

    await input.trigger('keydown', { key: 'ArrowDown' })
    let options = wrapper.findAll('[role="option"]')
    expect(options[1].attributes('aria-selected')).toBe('true')

    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    options = wrapper.findAll('[role="option"]')
    expect(options[3].attributes('aria-selected')).toBe('true')

    // envuelve de vuelta al principio
    await input.trigger('keydown', { key: 'ArrowDown' })
    options = wrapper.findAll('[role="option"]')
    expect(options[0].attributes('aria-selected')).toBe('true')
  })

  it('ArrowUp from the first row wraps to the last', async () => {
    wrapper = build()
    const input = wrapper.get('[data-testid="search-list-input"]')
    await input.trigger('keydown', { key: 'ArrowUp' })
    const options = wrapper.findAll('[role="option"]')
    expect(options[3].attributes('aria-selected')).toBe('true')
  })

  it('Home/End jump to the first/last row', async () => {
    wrapper = build()
    const input = wrapper.get('[data-testid="search-list-input"]')
    await input.trigger('keydown', { key: 'End' })
    let options = wrapper.findAll('[role="option"]')
    expect(options[3].attributes('aria-selected')).toBe('true')

    await input.trigger('keydown', { key: 'Home' })
    options = wrapper.findAll('[role="option"]')
    expect(options[0].attributes('aria-selected')).toBe('true')
  })

  it('Enter emits select with the currently active row', async () => {
    wrapper = build()
    const input = wrapper.get('[data-testid="search-list-input"]')
    await input.trigger('keydown', { key: 'ArrowDown' }) // activa la fila 1
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')!.at(-1)).toEqual([ITEMS[1]])
  })

  it('re-anchors the active row to the first visible match when a narrower filter leaves the previous active row out', async () => {
    wrapper = build()
    const input = wrapper.get('[data-testid="search-list-input"]')
    // activa "Sentadilla" (índice 1)
    await input.trigger('keydown', { key: 'ArrowDown' })

    await wrapper.setProps({ modelValue: 'press' })
    await input.trigger('keydown', { key: 'Enter' })
    // "Sentadilla" ya no está en la lista filtrada: se re-ancla a la primera visible
    expect(wrapper.emitted('select')!.at(-1)).toEqual([ITEMS[0]])
  })

  it('mouseenter on a row makes it the active one', async () => {
    wrapper = build()
    await wrapper.findAll('[role="option"]')[2].trigger('mouseenter')
    const options = wrapper.findAll('[role="option"]')
    expect(options[2].attributes('aria-selected')).toBe('true')
  })
})
