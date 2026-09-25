import { defineComponent, h, nextTick, ref } from 'vue'
import { getQuery } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSiteSettings } from './useSite'

describe('useSiteSettings', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    clearNuxtData()
  })

  it('stores the settings per locale and reads the new locale\'s settings when the locale changes', async () => {
    const requested: string[] = []
    unregisterAll.push(registerEndpoint('/api/settings', {
      method: 'GET',
      handler: (event) => {
        const locale = String(getQuery(event).locale)
        requested.push(locale)
        return { id: 's1', createdAt: 0, updatedAt: 0, title: `Title ${locale}` }
      },
    }))
    const locale = ref('de')
    let title: () => string | undefined = () => undefined
    await mountSuspended(defineComponent({
      async setup() {
        const { data } = await useSiteSettings(locale)
        title = () => data.value.title
        return () => h('div')
      },
    }))

    expect(title()).toBe('Title de')
    expect(useNuxtData('site:settings:de').data.value).toMatchObject({ title: 'Title de' })
    expect(useNuxtData('site:settings').data.value).toBeUndefined()

    locale.value = 'en'
    await nextTick()
    await vi.waitFor(() => expect(title()).toBe('Title en'))
    expect(useNuxtData('site:settings:en').data.value).toMatchObject({ title: 'Title en' })
    expect(requested).toEqual(['de', 'en'])
  })
})
