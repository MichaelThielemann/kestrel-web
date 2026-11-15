import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SingletonEditor from './SingletonEditor.vue'

const stubs = { KestrelCollectionEditor: true, KestrelRedirectsAuto: true, KestrelEditorStatus: true }

async function mountFor(collection: string) {
  return mountSuspended(SingletonEditor, { props: { collection, title: collection }, global: { stubs } })
}

describe('SingletonEditor', () => {
  it('keeps the redirects editor at its content height above the automatic redirects', async () => {
    const wrapper = await mountFor('redirects')
    expect(wrapper.get('.singleton').classes()).toContain('singleton--stacked')
    wrapper.unmount()
  })

  it('lets the editor of any other singleton shrink to the available height', async () => {
    const wrapper = await mountFor('settings')
    expect(wrapper.get('.singleton').classes()).not.toContain('singleton--stacked')
    wrapper.unmount()
  })
})
