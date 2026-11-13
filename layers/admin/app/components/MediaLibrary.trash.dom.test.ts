import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import type { Feature } from '#kestrel/pipelines'
import MediaLibrary from './MediaLibrary.vue'

const trashCapabilities: AdminSchema['capabilities'] = {
  listMediaFolders: { method: 'GET', path: '/media/folders' },
  listMedia: { method: 'GET', path: '/media' },
  deleteMedia: { method: 'DELETE', path: '/media/:id' },
  deleteMediaFolder: { method: 'DELETE', path: '/media/folders/*path' },
  trashMedia: { method: 'POST', path: '/media/trash' },
  trashMediaFolder: { method: 'POST', path: '/media/trash/folders/*path' },
  restoreMedia: { method: 'POST', path: '/media/trash/restore' },
  listMediaTrash: { method: 'GET', path: '/media/trash' },
}
const schema: AdminSchema = { locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: [], capabilities: { ...trashCapabilities } }
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function media(id: string, filename: string): MediaItem {
  return {
    id, filename, folder: '', contentType: 'image/jpeg', size: 10, path: `/media/${id}/${filename}`, available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
    description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
  }
}

const text = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce<string>((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key])

const unregisterAll: (() => void)[] = []
const trashed = new Set<string>()
const posted: { path: string; body: unknown }[] = []

function serve(files: MediaItem[], answer: (ids: string[]) => { ids: string[]; skipped: { id: string; reason: string }[] } = (ids) => ({ ids, skipped: [] })) {
  unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
  unregisterAll.push(registerEndpoint('/api/media', {
    method: 'GET',
    handler: (event) => {
      const query = getQuery(event)
      const live = files.filter((f) => !trashed.has(f.id))
      const items = typeof query.ids === 'string' ? live.filter((f) => String(query.ids).split(',').includes(f.id)) : live
      return { items, total: items.length }
    },
  }))
  unregisterAll.push(registerEndpoint('/api/media/trash', {
    method: 'GET',
    handler: () => ({ items: [], total: trashed.size }),
  }))
  unregisterAll.push(registerEndpoint('/api/media/trash', {
    method: 'POST',
    handler: async (event) => {
      const body = boundaryCast<{ ids: string[] }>(await readBody(event), 'json')
      posted.push({ path: '/media/trash', body })
      const res = answer(body.ids)
      for (const id of res.ids) trashed.add(id)
      return { ...res, unchanged: [], trashVersions: {} }
    },
  }))
  unregisterAll.push(registerEndpoint('/api/media/trash/restore', {
    method: 'POST',
    handler: async (event) => {
      const body = boundaryCast<{ ids: string[] }>(await readBody(event), 'json')
      posted.push({ path: '/media/trash/restore', body })
      for (const id of body.ids) trashed.delete(id)
      return { ids: body.ids, skipped: [], renamed: [], unchanged: [], trashVersions: {} }
    },
  }))
}

beforeEach(async () => {
  trashed.clear()
  posted.length = 0
  useToast().clear()
  schema.capabilities = { ...trashCapabilities }
  schema.features = []
  unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
  unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))
  await useSchema().load()
})

afterEach(() => {
  unregisterAll.splice(0).forEach((unregister) => unregister())
})

async function mountLibrary(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(MediaLibrary, { props, attachTo: document.body })
  onTestFinished(() => wrapper.unmount())
  return wrapper
}

async function select(wrapper: VueWrapper, name: string) {
  const box = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').find((b) => b.attributes('aria-label') === text('media.selection.selectItem', { name }))
  if (!box) throw new Error(`expected a checkbox for ${name}`)
  await box.setValue(true)
}

function barButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('.media-selection-bar button').find((b) => b.text() === label)
}

const dialog = () => document.body.querySelector('.ui-dialog__content')
const dialogButton = (label: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ui-dialog__content button')).find((b) => b.textContent?.trim() === label)

describe('MediaLibrary with the trash', () => {
  it('moves the selection to the trash without a dialog and offers undo, which restores the same ids', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await select(wrapper, 'b.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))
    expect(posted).toEqual([{ path: '/media/trash', body: { ids: ['f1', 'f2'] } }])
    expect(dialog()).toBeNull()
    const toast = useToast().items.find((item) => item.message === text('media.trash.movedPlural', { n: 2 }))
    expect(toast?.action?.label).toBe(en['media.trash.undo'])
    await vi.waitFor(() => expect(wrapper.find('[data-test="media-trash-entry"]').text()).toBe(text('media.trash.entry', { n: 2 })))

    toast?.action?.run()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    expect(posted[1]).toEqual({ path: '/media/trash/restore', body: { ids: ['f1', 'f2'] } })
  })

  it('offers no undo to a role that may not restore', async () => {
    delete schema.capabilities.restoreMedia
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(useToast().items.some((item) => item.message === en['media.trash.moved'])).toBe(true))
    expect(useToast().items.find((item) => item.message === en['media.trash.moved'])?.action).toBeUndefined()
  })

  it('warns before trashing a file a page uses, names the page, and trashes only after the confirmation', async () => {
    schema.features = ['references' satisfies Feature]
    schema.capabilities.mediaReferrersMany = { method: 'GET', path: '/admin/references/to/media' }
    unregisterAll.push(registerEndpoint('/api/admin/references/to/media', { method: 'GET', handler: () => ({ f1: [{ type: 'pages', field: 'hero', id: 'p1' }] }) }))
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.querySelector('.media-remove__in-use')?.textContent).toContain(en['media.remove.inUse']))
    expect(dialog()?.querySelector('.media-remove__in-use a')?.getAttribute('href')).toBe('/admin/pages/p1')
    expect(posted).toEqual([])
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe(en['common.cancel']))

    dialogButton(text('media.remove.confirm.trash', { what: en['media.remove.files'] }))?.click()
    await vi.waitFor(() => expect(posted).toEqual([{ path: '/media/trash', body: { ids: ['f1'] } }]))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('asks first when references are tracked but this role may not look them up', async () => {
    schema.features = ['references' satisfies Feature]
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.unverified']))
    expect(posted).toEqual([])
  })

  it('lists an item the server left alone and keeps it selected while the rest leaves', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')], (ids) => ({ ids: ids.filter((id) => id !== 'f2'), skipped: [{ id: 'f2', reason: 'not_found' }] }))
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await select(wrapper, 'b.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    expect(dialog()?.textContent).toContain('b.jpg')
    expect(dialog()?.textContent).toContain(en['media.trash.reason.notFound'])
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))
    expect(wrapper.get('[data-test="file-f2"]').attributes('aria-pressed')).toBe('true')
  })

  it('drops a trashed pick so it is never confirmed into the field', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')])
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    const use = wrapper.findAll('.media-pick-bar button').find((b) => b.text() === en['media.useSelected'])
    await use?.trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f2']]]))
  })

  it('gives every tile of a single pick a "…" menu with only the delete entry and no checkbox', async () => {
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary({ pick: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    const trigger = wrapper.find(`button[aria-label="${text('media.menu.more', { name: 'a.jpg' })}"]`)
    expect(trigger.exists()).toBe(true)
    expect(wrapper.find('[data-test="media-trash-entry"]').exists()).toBe(false)
  })
})
