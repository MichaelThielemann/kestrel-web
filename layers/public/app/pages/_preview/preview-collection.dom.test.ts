import { defineComponent, h } from 'vue'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PreviewPage from './[key].vue'
import { previewStorageKey } from '../../utils/preview-channel'

const Blog = defineComponent({
  props: { document: { type: Object, required: true }, collection: { type: String, required: true } },
  setup: (props) => () => h('section', { class: 'blog-view' }, `${props.collection}: ${String(Reflect.get(props.document, 'title'))}`),
})

describe('the preview of a mounted collection\'s document', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    sessionStorage.clear()
  })

  function snapshot(collection: string | undefined) {
    const document = { id: 'b1', slug: 'hallo', title: 'Hallo', body: [], seo: null, layout: null }
    sessionStorage.setItem(previewStorageKey('b1'), JSON.stringify({ document, locale: 'de', ...(collection === undefined ? {} : { collection }) }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: 'Site' }) }))
  }

  it('renders it with the component named after its collection, as the site does', async () => {
    snapshot('blog')
    const wrapper = await mountSuspended(PreviewPage, { route: '/_preview/b1', global: { components: { Blog } } })
    await vi.waitFor(() => expect(wrapper.find('.blog-view').text()).toBe('blog: Hallo'))
  })

  it('renders a page with the page template', async () => {
    snapshot(undefined)
    const wrapper = await mountSuspended(PreviewPage, { route: '/_preview/b1', global: { components: { Blog } } })
    await vi.waitFor(() => expect(wrapper.find('article.site-page').exists()).toBe(true))
    expect(wrapper.find('.blog-view').exists()).toBe(false)
  })
})
