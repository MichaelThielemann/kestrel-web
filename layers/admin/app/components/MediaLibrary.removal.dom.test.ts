import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, MediaItem, MediaTrashItem } from '#kestrel-admin/types/api'
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

function media(id: string, filename: string, folder = ''): MediaItem {
  return {
    id, filename, folder, contentType: 'image/jpeg', size: 10, path: `/media/${id}/${filename}`, available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
    description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
  }
}

const text = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce<string>((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key])

interface Answer { ids: string[]; unchanged?: string[]; skipped?: { id: string; reason: string }[] }

const unregisterAll: (() => void)[] = []
const posted: { path: string; body: unknown }[] = []
const deleted: string[] = []
let files: MediaItem[] = []
let folders: string[] = []
let trashed = new Set<string>()
let trashAnswer: (ids: string[]) => Answer = (ids) => ({ ids })
let restoreAnswer: (ids: string[]) => Answer = (ids) => ({ ids })
let failFolders = false
let gate: Promise<void> | null = null

const live = () => files.filter((f) => !trashed.has(f.id) && !deleted.includes(f.id))

function serve() {
  unregisterAll.push(registerEndpoint('/api/media/folders', {
    method: 'GET',
    handler: () => {
      if (failFolders && trashed.size) throw createError({ statusCode: 503, statusMessage: 'unavailable' })
      return folders.map((folder) => ({ folder, count: live().filter((f) => f.folder === folder).length }))
    },
  }))
  unregisterAll.push(registerEndpoint('/api/media', {
    method: 'GET',
    handler: (event) => {
      const query = getQuery(event)
      const folder = typeof query.folder === 'string' ? query.folder : ''
      const all = query.recursive ? live().filter((f) => f.folder === folder || f.folder.startsWith(`${folder}/`)) : live().filter((f) => f.folder === folder)
      const offset = Number(query.offset ?? 0)
      const limit = Number(query.limit ?? 25)
      return { items: all.slice(offset, offset + limit), total: all.length }
    },
  }))
  unregisterAll.push(registerEndpoint('/api/media/trash', {
    method: 'GET',
    handler: () => {
      const items = files.filter((f) => trashed.has(f.id)).map((f): MediaTrashItem => ({ ...f, path: null, trashedAt: 1, expiresAt: 2 }))
      return { items, total: items.length }
    },
  }))
  unregisterAll.push(registerEndpoint('/api/media/trash', {
    method: 'POST',
    handler: async (event) => {
      const body = boundaryCast<{ ids: string[] }>(await readBody(event), 'json')
      posted.push({ path: '/media/trash', body })
      const answer = trashAnswer(body.ids)
      for (const id of answer.ids) trashed.add(id)
      return { skipped: [], unchanged: [], trashVersions: {}, ...answer }
    },
  }))
  unregisterAll.push(registerEndpoint('/api/media/trash/restore', {
    method: 'POST',
    handler: async (event) => {
      const body = boundaryCast<{ ids: string[] }>(await readBody(event), 'json')
      posted.push({ path: '/media/trash/restore', body })
      const answer = restoreAnswer(body.ids)
      for (const id of answer.ids) trashed.delete(id)
      return { skipped: [], renamed: [], unchanged: [], trashVersions: {}, ...answer }
    },
  }))
}

function serveFolderTrash(path: string, answer: () => Answer) {
  unregisterAll.push(registerEndpoint(`/api/media/trash/folders/${path}`, {
    method: 'POST',
    handler: () => {
      posted.push({ path: `/media/trash/folders/${path}`, body: null })
      const result = answer()
      for (const id of result.ids) trashed.add(id)
      folders = folders.filter((f) => f !== path && !f.startsWith(`${path}/`))
      return { path, unchanged: [], trashVersions: {}, ...result }
    },
  }))
}

function serveDelete(id: string) {
  unregisterAll.push(registerEndpoint(`/api/media/${id}`, {
    method: 'DELETE',
    handler: async () => {
      deleted.push(id)
      if (gate) await gate
      return {}
    },
  }))
}

beforeEach(async () => {
  posted.length = 0
  deleted.length = 0
  trashed = new Set()
  files = []
  folders = []
  failFolders = false
  gate = null
  trashAnswer = (ids) => ({ ids })
  restoreAnswer = (ids) => ({ ids })
  useToast().clear()
  schema.capabilities = { ...trashCapabilities }
  schema.features = []
  schema.mediaTrash = true
  unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
  unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))
  serve()
  await useSchema().load()
})

afterEach(() => {
  unregisterAll.splice(0).forEach((unregister) => unregister())
})

async function mountLibrary(props: Record<string, unknown> = {}, route?: string) {
  const wrapper = await mountSuspended(MediaLibrary, { props, attachTo: document.body, ...(route ? { route } : {}) })
  onTestFinished(() => wrapper.unmount())
  return wrapper
}

async function select(wrapper: VueWrapper, name: string) {
  const box = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').find((b) => b.attributes('aria-label') === text('media.selection.selectItem', { name }))
  if (!box) throw new Error(`expected a checkbox for ${name}`)
  await box.setValue(true)
}

const barButton = (wrapper: VueWrapper, label: string) => wrapper.findAll('.media-selection-bar button').find((b) => b.text() === label || b.attributes('aria-label') === label)
const dialog = () => document.body.querySelector('.ui-dialog__content')
const dialogButton = (label: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ui-dialog__content button')).find((b) => b.textContent?.trim() === label)
const toast = (message: string) => useToast().items.find((item) => item.message === message)

async function key(el: Element, init: KeyboardEventInit) {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  await nextTick()
}

describe('MediaLibrary undo after a move to the trash', () => {
  it('brings back only what the move put in the trash, not what was there already', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    trashAnswer = (ids) => ({ ids, unchanged: ['f2'] })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await select(wrapper, 'b.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(toast(text('media.trash.movedPlural', { n: 2 }))?.action).toBeDefined())

    toast(text('media.trash.movedPlural', { n: 2 }))?.action?.run()
    await vi.waitFor(() => expect(posted.at(-1)).toEqual({ path: '/media/trash/restore', body: { ids: ['f1'] } }))
  })

  it('offers no undo when everything was in the trash already, and removes an empty folder without claiming it moved', async () => {
    files = [media('f1', 'a.jpg')]
    folders = ['drafts']
    trashAnswer = (ids) => ({ ids, unchanged: ids })
    serveFolderTrash('drafts', () => ({ ids: [] }))
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await select(wrapper, 'drafts')
    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    const message = text('media.trash.summary', { moved: en['media.trash.moved'], emptied: en['media.trash.emptied'] })
    await vi.waitFor(() => expect(toast(message)).toBeDefined())
    expect(toast(message)?.action).toBeUndefined()
  })

  it('reloads the trash view mounted after the library when the toast is undone there', async () => {
    files = [media('f1', 'a.jpg')]
    const library = await mountLibrary()
    await vi.waitFor(() => expect(library.find('[data-test="file-f1"]').exists()).toBe(true))
    await select(library, 'a.jpg')
    await barButton(library, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(toast(en['media.trash.moved'])?.action).toBeDefined())
    library.unmount()

    const trashView = await mountSuspended(MediaTrash, { attachTo: document.body })
    onTestFinished(() => trashView.unmount())
    await vi.waitFor(() => expect(trashView.findAll('tbody tr')).toHaveLength(1))

    toast(en['media.trash.moved'])?.action?.run()
    await vi.waitFor(() => expect(trashView.findAll('tbody tr')).toHaveLength(0))
  })

  it('names what the undo could not bring back by file name and claims no success for nothing', async () => {
    files = [media('f1', 'a.jpg')]
    restoreAnswer = () => ({ ids: [], skipped: [{ id: 'f1', reason: 'not_found' }] })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(toast(en['media.trash.moved'])?.action).toBeDefined())

    toast(en['media.trash.moved'])?.action?.run()

    const skipped = text('media.trash.notRestored', { names: `a.jpg (${en['media.trash.reason.notFound']})` })
    await vi.waitFor(() => expect(toast(skipped)).toBeDefined())
    expect(useToast().items.some((item) => item.type === 'success' && item.message !== en['media.trash.moved'])).toBe(false)
  })

  it('still offers the undo and forgets the picks when the reload after the move fails', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    failFolders = true
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(wrapper.find('[data-test="media-undo"]').exists()).toBe(true))
    expect(wrapper.get('.media-pick-bar').text()).toContain(text('media.pick.countPlural', { n: 0 }))
  })
})

describe('MediaLibrary undo inside the picker', () => {
  it('shows the undo in the picker instead of a toast, and undoes through its button', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))

    expect(useToast().items).toEqual([])
    const notice = wrapper.get('.media-undo')
    expect(notice.get('[role="status"]').text()).toBe(en['media.trash.moved'])
    await notice.get('[data-test="media-undo"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    expect(posted.at(-1)).toEqual({ path: '/media/trash/restore', body: { ids: ['f1'] } })
    expect(wrapper.get('.media-undo [role="status"]').text()).toBe(en['media.trash.restored'])
    expect(useToast().items).toEqual([])
  })
})

describe('MediaLibrary focus after a removal', () => {
  it('moves focus to the next tile after Delete on a tile sends it to the trash without a dialog', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')]
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))

    const tile = boundaryCast<HTMLElement>(wrapper.get('[data-test="file-f2"]').element, 'dom')
    tile.focus()
    await key(tile, { key: 'Delete' })

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(false))
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[data-test="file-f3"]').element))
  })

  it('moves focus into the listing after the bar trashes the selection and leaves', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    const button = barButton(wrapper, en['media.selection.trash'])
    boundaryCast<HTMLElement>(button?.element, 'dom').focus()
    await button?.trigger('click')

    await vi.waitFor(() => expect(wrapper.find('.media-selection-bar').exists()).toBe(false))
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[data-test="file-f2"]').element))
  })

  it('focuses the restored tile after an undo from the picker', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f1"]').trigger('click')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="media-undo"]').exists()).toBe(true))

    const undo = boundaryCast<HTMLElement>(wrapper.get('[data-test="media-undo"]').element, 'dom')
    undo.focus()
    undo.click()

    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[data-test="file-f1"]').element))
  })
})

describe('MediaLibrary final delete without the trash', () => {
  beforeEach(() => {
    schema.capabilities = {
      listMediaFolders: trashCapabilities.listMediaFolders!, listMedia: trashCapabilities.listMedia!,
      deleteMedia: trashCapabilities.deleteMedia!, deleteMediaFolder: trashCapabilities.deleteMediaFolder!,
    }
    delete schema.mediaTrash
  })

  it('keeps the in-use warning of the current dialog when the check of an earlier one answers late', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    schema.features = ['references']
    schema.capabilities.mediaReferrersMany = { method: 'GET', path: '/admin/references/to/media' }
    let releaseFirst = () => {}
    const first = new Promise<void>((resolve) => { releaseFirst = resolve })
    let firstAnswered = false
    unregisterAll.push(registerEndpoint('/api/admin/references/to/media', {
      method: 'GET',
      handler: async (event) => {
        const ids = String(getQuery(event).ids)
        if (ids === 'f1') {
          await first
          firstAnswered = true
          return {}
        }
        return { f2: [{ type: 'pages', field: 'hero', id: 'p1' }] }
      },
    }))
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await select(wrapper, 'a.jpg')
    await barButton(wrapper, en['media.selection.delete'])?.trigger('click')
    await vi.waitFor(() => expect(dialog()).toBeTruthy())
    dialogButton(en['common.cancel'])?.click()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    await wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').find((b) => b.attributes('aria-label') === text('media.selection.selectItem', { name: 'a.jpg' }))?.setValue(false)
    await select(wrapper, 'b.jpg')
    await barButton(wrapper, en['media.selection.delete'])?.trigger('click')
    await vi.waitFor(() => expect(dialog()?.querySelector('.media-remove__in-use')?.textContent).toContain('b.jpg'))

    releaseFirst()
    await vi.waitFor(() => expect(firstAnswered).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(dialog()?.querySelector('.media-remove__in-use')?.textContent).toContain('b.jpg')
  })

  it('stops after the request under way when Stop is pressed, and keeps the dialog to say so', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')]
    for (const f of files) serveDelete(f.id)
    let release = () => {}
    gate = new Promise((resolve) => { release = resolve })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))

    for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) await select(wrapper, name)
    await barButton(wrapper, en['media.selection.delete'])?.trigger('click')
    await vi.waitFor(() => expect(dialog()).toBeTruthy())
    dialogButton(text('media.remove.confirm.delete', { what: text('media.remove.filesPlural', { n: 3 }) }))?.click()
    await vi.waitFor(() => expect(deleted).toEqual(['f1']))

    dialogButton(en['media.remove.stop'])?.click()
    release()

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.cancelled']))
    expect(deleted).toEqual(['f1'])
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))
    expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true)
  })

  it('drops the picks below a deleted folder, so they are never confirmed into the field', async () => {
    files = [media('f1', 'a.jpg', 'a'), media('f2', 'b.jpg')]
    folders = ['a']
    unregisterAll.push(registerEndpoint('/api/media/folders/a', { method: 'DELETE', handler: () => { deleted.push('f1'); return {} } }))
    const wrapper = await mountLibrary({ pick: true, multiple: true, initialSelected: ['f1'] })
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-a"]').exists()).toBe(true))

    await wrapper.get('[data-test="folder-a"]').trigger('contextmenu')
    const remove = await vi.waitFor(() => {
      const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => el.textContent?.trim() === en['media.menu.delete'])
      if (!item) throw new Error('no delete entry')
      return item
    })
    remove.click()
    await vi.waitFor(() => expect(dialog()).toBeTruthy())
    await vi.waitFor(() => expect(document.body.querySelector('.media-remove__recursive input')).toBeTruthy())
    document.body.querySelector<HTMLInputElement>('.media-remove__recursive input')?.click()
    dialogButton(text('media.remove.confirm.delete', { what: en['media.remove.folders'] }))?.click()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await wrapper.findAll('.media-pick-bar button').find((b) => b.text() === en['media.useSelected'])?.trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f2']]]))
  })
})

describe('MediaLibrary paging and the trash entry', () => {
  it('goes back to the last page when a removal empties the page shown', async () => {
    files = Array.from({ length: 27 }, (_, i) => media(`f${i}`, `${String(i).padStart(2, '0')}.jpg`))
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f0"]').exists()).toBe(true))
    const next = wrapper.findAll('button').find((b) => b.text() === en['list.next'])
    await next?.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f26"]').exists()).toBe(true))

    await select(wrapper, '25.jpg')
    await select(wrapper, '26.jpg')
    await barButton(wrapper, en['media.selection.trash'])?.trigger('click')

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f0"]').exists()).toBe(true))
    expect(wrapper.find('.media-library__empty').exists()).toBe(false)
  })

  it('keeps the folder on the way into the trash', async () => {
    files = [media('f1', 'a.jpg', 'events')]
    folders = ['events']
    const wrapper = await mountLibrary({}, '/admin/media')
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-events"]').exists()).toBe(true))
    await wrapper.get('[data-test="folder-events"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    expect(wrapper.get('[data-test="media-trash-entry"]').attributes('href')).toBe('/admin/media?trash=1&folder=events')
  })
})

describe('MediaLibrary selection keys in the bar and the folders', () => {
  it('clears the selection with Escape in the bar and puts focus back on the listing', async () => {
    files = [media('f1', 'a.jpg')]
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    await select(wrapper, 'a.jpg')

    const clear = barButton(wrapper, en['media.selection.clear'])
    boundaryCast<HTMLElement>(clear?.element, 'dom').focus()
    await key(boundaryCast<HTMLElement>(clear?.element, 'dom'), { key: 'Escape' })

    expect(wrapper.find('.media-selection-bar').exists()).toBe(false)
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[data-test="file-f1"]').element))
  })

  it('selects the page with Ctrl+A in the bar', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg')]
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await select(wrapper, 'a.jpg')

    await key(boundaryCast<HTMLElement>(barButton(wrapper, en['media.selection.clear'])?.element, 'dom'), { key: 'a', ctrlKey: true })

    expect(wrapper.get('.media-selection-bar .ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 2 }))
  })

  it('opens a folder with Enter while something is selected', async () => {
    files = [media('f1', 'a.jpg'), media('f2', 'b.jpg', 'docs')]
    folders = ['docs']
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-docs"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f1"]').trigger('click')

    await wrapper.get('[data-test="folder-docs"]').trigger('keydown', { key: 'Enter' })

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
  })

  it('clears only the listed picks in a multi-pick and keeps those in other folders', async () => {
    files = [media('f1', 'a.jpg')]
    const wrapper = await mountLibrary({ pick: true, multiple: true, initialSelected: ['elsewhere'] })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.get('.media-pick-bar').text()).toContain(text('media.pick.countPlural', { n: 2 }))

    await barButton(wrapper, en['media.selection.clear'])?.trigger('click')

    expect(wrapper.get('.media-pick-bar').text()).toContain(en['media.pick.count'])
  })
})
