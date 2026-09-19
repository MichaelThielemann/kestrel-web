import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { ImagesFailedVariant } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import SystemImagesFailures from './SystemImagesFailures.vue'

const recent: ImagesFailedVariant[] = [
  { mediaId: 'med-1', size: 'thumb', attempts: 3, error: 'render timed out after 30000ms', updatedAt: Date.UTC(2026, 8, 19, 10, 0, 0) },
  { mediaId: 'med-2', size: 'hero', attempts: 5, error: null, updatedAt: Date.UTC(2026, 8, 19, 9, 0, 0) },
]

describe('SystemImagesFailures', () => {
  it('renders the empty state when nothing failed', async () => {
    const wrapper = await mountSuspended(SystemImagesFailures, { props: { variants: 0, recent: [] } })

    expect(wrapper.text()).toContain(en['images.noFailures'])
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('lists media, size, attempts, error and time, with the absolute time in title', async () => {
    const wrapper = await mountSuspended(SystemImagesFailures, { props: { variants: 7, recent } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)

    expect(rows[0]!.get('a').attributes('href')).toBe('/admin/media')
    expect(rows[0]!.get('a').text()).toBe('med-1')
    expect(rows[0]!.text()).toContain('thumb')
    expect(rows[0]!.get('.images-failures__num').text()).toBe('3')
    expect(rows[0]!.get('.images-failures__error').text()).toBe('render timed out after 30000ms')
    expect(rows[0]!.get('.images-failures__when').attributes('title')).toBeTruthy()

    expect(rows[1]!.get('.images-failures__error').text()).toBe('—')
  })

  it('reports the total next to the sample size', async () => {
    const wrapper = await mountSuspended(SystemImagesFailures, { props: { variants: 7, recent } })

    expect(wrapper.get('.images-failures__count').text()).toBe((en['images.failedCount'] ?? '').replace('{variants}', '7').replace('{shown}', '2'))
  })
})
