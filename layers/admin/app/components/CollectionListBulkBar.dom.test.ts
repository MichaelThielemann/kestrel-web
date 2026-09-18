import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { en } from '#kestrel-admin/i18n/en'
import CollectionListBulkBar from './CollectionListBulkBar.vue'

describe('CollectionListBulkBar', () => {
  it('offers publish and unpublish as the live flag, not as status literals', async () => {
    const wrapper = await mountSuspended(CollectionListBulkBar, { props: { count: 2, hasWorkflow: true, busy: false } })

    const buttons = wrapper.findAll('button')
    const publish = buttons.find((b) => b.text() === en['list.bulkPublish'])
    const unpublish = buttons.find((b) => b.text() === en['list.bulkUnpublish'])

    await publish?.trigger('click')
    await unpublish?.trigger('click')

    expect(wrapper.emitted('setStatus')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('offers no status actions for a collection without a workflow', async () => {
    const wrapper = await mountSuspended(CollectionListBulkBar, { props: { count: 2, hasWorkflow: false, busy: false } })

    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).not.toContain(en['list.bulkPublish'])
    expect(labels).not.toContain(en['list.bulkUnpublish'])
    expect(labels).toContain(en['list.bulkDelete'])
    wrapper.unmount()
  })
})
