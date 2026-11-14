import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, getQuery, getRequestHeader, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import type { Feature } from '#kestrel/pipelines'
import MediaLibrary from './MediaLibrary.vue'
import MediaTrash from './MediaTrash.vue'

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
const schema: AdminSchema = { locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: [], capabilities: { ...trashCapabilities }, mediaTrash: true }
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
    description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
  }
}

const text = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce<string>((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key])

const unregisterAll: (() => void)[] = []
const trashed = new Set<string>()
const posted: { path: string; body: unknown }[] = []
let folderList: string[] = []

function serve(files: MediaItem[], answer: (ids: string[]) => { ids: string[]; skipped: { id: string; reason: string }[] } = (ids) => ({ ids, skipped: [] })) {
  unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => folderList.map((folder) => ({ folder, count: 0 })) }))
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

const sentIds: Record<string, string> = {}

function failFolderTrash(path: string) {
  folderList = [...folderList, path]
  unregisterAll.push(registerEndpoint(`/api/media/trash/folders/${path}`, {
    method: 'POST',
    handler: (event) => {
      posted.push({ path: `/media/trash/folders/${path}`, body: null })
      sentIds[path] = getRequestHeader(event, 'x-request-id') ?? ''
      throw createError({ statusCode: 500, statusMessage: 'disk full' })
    },
  }))
}

beforeEach(async () => {
  trashed.clear()
  folderList = []
  posted.length = 0
  useToast().clear()
  schema.capabilities = { ...trashCapabilities }
  schema.features = []
  schema.mediaTrash = true
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

  it('names the HTTP status and the error id of a reference check that failed before the move', async () => {
    schema.features = ['references' satisfies Feature]
    schema.capabilities.mediaReferrersMany = { method: 'GET', path: '/admin/references/to/media' }
    let sent = ''
    unregisterAll.push(registerEndpoint('/api/admin/references/to/media', {
      method: 'GET',
      handler: (event) => {
        sent = getRequestHeader(event, 'x-request-id') ?? ''
        throw createError({ statusCode: 502, statusMessage: 'bad gateway' })
      },
    }))
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.querySelector('.ui-alert')?.textContent).toContain(`${en['media.remove.unverified'].replace(/\.$/, '')} (HTTP 502 · ${text('error.id', { id: sent })})`))
    expect(posted).toEqual([])
  })

  it('names what failed in a final delete without the trash, with the HTTP status and the error id', async () => {
    schema.mediaTrash = false
    let sent = ''
    unregisterAll.push(registerEndpoint('/api/media/f1', {
      method: 'DELETE',
      handler: (event) => {
        sent = getRequestHeader(event, 'x-request-id') ?? ''
        throw createError({ statusCode: 500, statusMessage: 'down' })
      },
    }))
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.delete'])?.trigger('click')
    await vi.waitFor(() => expect(dialogButton(text('media.remove.confirm.delete', { what: en['media.remove.files'] }))).toBeDefined())
    dialogButton(text('media.remove.confirm.delete', { what: en['media.remove.files'] }))?.click()

    await vi.waitFor(() => expect(dialog()?.querySelector('.media-remove__problems')?.textContent).toContain(`${en['media.remove.deleteFailed'].replace(/\.$/, '')} (HTTP 500 · ${text('error.id', { id: sent })})`))
  })

  it('lists an item whose move failed and keeps it selected while the rest leaves', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')])
    failFolderTrash('drafts')
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-drafts"]').exists()).toBe(true))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'drafts')
    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    expect(dialog()?.textContent).toContain('drafts')
    expect(dialog()?.textContent).toContain(en['media.remove.failed'])
    expect(sentIds.drafts).toMatch(/^[0-9a-f]{12}$/)
    expect(dialog()?.querySelector('.media-remove__problems')?.textContent).toContain(`${en['media.trash.trashFailed'].replace(/\.$/, '')} (HTTP 500 · ${text('error.id', { id: sentIds.drafts ?? '' })})`)
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))
    expect(wrapper.get('[data-test="folder-drafts"]').attributes('aria-pressed')).toBe('true')
  })

  it('treats an item gone before the move as removed and opens no report for it', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')], (ids) => {
      trashed.add('f2')
      return { ids: ids.filter((id) => id !== 'f2'), skipped: [{ id: 'f2', reason: 'not_found' }] }
    })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await select(wrapper, 'b.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(useToast().items.find((item) => item.message === en['media.trash.moved'])?.action).toBeDefined())
    expect(dialog()).toBeNull()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(false))
  })

  it('names an item already gone without calling it kept when the report opens for another one', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')], (ids) => ({ ids: ids.filter((id) => id !== 'f2'), skipped: [{ id: 'f2', reason: 'not_found' }] }))
    failFolderTrash('drafts')
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-drafts"]').exists()).toBe(true))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'drafts')
    await select(wrapper, 'b.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    expect(dialog()?.textContent).toContain(en['media.trash.reason.notFound'])
    expect(dialog()?.textContent).not.toContain(en['media.remove.kept'])
  })

  it('offers the undo inside the result dialog and hands it to a toast once the dialog closes', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')])
    failFolderTrash('drafts')
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-drafts"]').exists()).toBe(true))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'drafts')
    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    expect(dialog()?.textContent).toContain(en['media.trash.moved'])
    expect(dialogButton(en['media.trash.undo'])).toBeDefined()
    expect(useToast().items.some((item) => item.action)).toBe(false)

    dialogButton(en['media.remove.close'])?.click()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    const toast = useToast().items.find((item) => item.message === en['media.trash.moved'])
    expect(toast?.action?.label).toBe(en['media.trash.undo'])
  })

  it('undoes from inside the result dialog, which closes it', async () => {
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')])
    failFolderTrash('drafts')
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-drafts"]').exists()).toBe(true))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await select(wrapper, 'drafts')
    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(dialogButton(en['media.trash.undo'])).toBeDefined())

    dialogButton(en['media.trash.undo'])?.click()

    await vi.waitFor(() => expect(dialog()).toBeNull())
    await vi.waitFor(() => expect(posted.at(-1)).toEqual({ path: '/media/trash/restore', body: { ids: ['f1'] } }))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    expect(useToast().items.some((item) => item.message === en['media.trash.moved'])).toBe(false)
  })

  it('moves focus to the undo and announces the outcome once a run in the open dialog ends with something to report', async () => {
    schema.features = ['references' satisfies Feature]
    schema.capabilities.mediaReferrersMany = { method: 'GET', path: '/admin/references/to/media' }
    unregisterAll.push(registerEndpoint('/api/admin/references/to/media', { method: 'GET', handler: () => ({ f1: [{ type: 'pages', field: 'hero', id: 'p1' }] }) }))
    serve([media('f1', 'a.jpg'), media('f2', 'b.jpg')])
    failFolderTrash('drafts')
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-drafts"]').exists()).toBe(true))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'drafts')
    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe(en['common.cancel']))

    const what = text('media.remove.both', { files: en['media.remove.files'], folders: en['media.remove.folders'] })
    dialogButton(text('media.remove.confirm.trash', { what }))?.click()

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    await vi.waitFor(() => expect(document.activeElement).toBe(dialogButton(en['media.trash.undo'])))
    const status = dialog()?.querySelector('[role="status"]')?.textContent ?? ''
    expect(status).toContain(en['media.remove.title.partial'])
    expect(status).toContain(en['media.trash.moved'])
  })

  it('hides Delete from a role that may delete for good but not move to the trash', async () => {
    schema.capabilities = { ...trashCapabilities }
    delete schema.capabilities.trashMedia
    delete schema.capabilities.trashMediaFolder
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    expect(barButton(wrapper, en['media.selection.trash'])).toBeUndefined()
    expect(barButton(wrapper, en['media.selection.delete'])).toBeUndefined()
  })

  it('moves to the trash for a role that may trash but not delete for good', async () => {
    schema.capabilities = { ...trashCapabilities }
    delete schema.capabilities.deleteMedia
    delete schema.capabilities.deleteMediaFolder
    serve([media('f1', 'a.jpg')])
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(posted).toEqual([{ path: '/media/trash', body: { ids: ['f1'] } }]))
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

describe('MediaLibrary and the trash view switching', () => {
  it('puts focus on the trash heading after the trash entry was pressed, and on the library after the way back', async () => {
    serve([media('f1', 'a.jpg')])
    trashed.add('f0')
    const showTrash = ref(false)
    const Host = defineComponent({ setup: () => () => (showTrash.value ? h(MediaTrash) : h(MediaLibrary)) })
    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await vi.waitFor(() => expect(wrapper.find('[data-test="media-trash-entry"]').exists()).toBe(true))

    boundaryCast<HTMLElement>(wrapper.get('[data-test="media-trash-entry"]').element, 'dom').focus()
    showTrash.value = true
    await nextTick()
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe(en['media.trash.title']))

    boundaryCast<HTMLElement>(wrapper.get('[data-test="media-trash-back"]').element, 'dom').focus()
    showTrash.value = false
    await nextTick()
    await vi.waitFor(() => expect(document.activeElement?.classList.contains('media-library')).toBe(true))
  })

  it('leaves focus alone when a view mounts without the other one handing over', async () => {
    serve([media('f1', 'a.jpg')])
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const trashView = await mountSuspended(MediaTrash, { attachTo: document.body })
    onTestFinished(() => trashView.unmount())
    await vi.waitFor(() => expect(trashView.text()).toContain(en['media.trash.empty']))
    expect(document.activeElement).toBe(document.body)
  })
})
