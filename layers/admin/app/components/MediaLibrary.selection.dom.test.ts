import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import MediaLibrary from './MediaLibrary.vue'

const fullCapabilities: AdminSchema['capabilities'] = {
  listMediaFolders: { method: 'GET', path: '/media/folders' },
  listMedia: { method: 'GET', path: '/media' },
  uploadMedia: { method: 'POST', path: '/media' },
  deleteMedia: { method: 'DELETE', path: '/media/:id' },
  deleteMediaFolder: { method: 'DELETE', path: '/media/folders/*path' },
}
const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { ...fullCapabilities },
}
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
    description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
  }
}

const text = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce<string>((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key])

const unregisterAll: (() => void)[] = []
const deleted: string[] = []

interface Listing { folders?: string[]; files: Record<string, MediaItem[]> }

function serve(listing: Listing, byId: (id: string) => MediaItem | undefined = () => undefined, idCap = Infinity) {
  unregisterAll.push(registerEndpoint('/api/media/folders', {
    method: 'GET',
    handler: () => (listing.folders ?? []).map((folder) => ({ folder, count: listing.files[folder]?.length ?? 0 })),
  }))
  unregisterAll.push(registerEndpoint('/api/media', {
    method: 'GET',
    handler: (event) => {
      const query = getQuery(event)
      if (typeof query.ids === 'string') {
        const items = query.ids.split(',').slice(0, idCap).map(byId).filter((item): item is MediaItem => item !== undefined)
        return { items, total: items.length }
      }
      const q = typeof query.q === 'string' ? query.q : ''
      const all = (listing.files[typeof query.folder === 'string' ? query.folder : ''] ?? []).filter((f) => !deleted.includes(f.id))
      const items = q ? all.filter((f) => f.filename.includes(q)) : all
      return { items, total: items.length }
    },
  }))
}

function serveDelete(id: string) {
  unregisterAll.push(registerEndpoint(`/api/media/${id}`, { method: 'DELETE', handler: () => { deleted.push(id); return {} } }))
}

beforeEach(async () => {
  deleted.length = 0
  schema.capabilities = { ...fullCapabilities }
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

function checkbox(wrapper: VueWrapper, name: string): DOMWrapper<HTMLInputElement> {
  const box = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').find((b) => b.attributes('aria-label') === text('media.selection.selectItem', { name }))
  if (!box) throw new Error(`expected a checkbox for ${name}`)
  return box
}

function bar(wrapper: VueWrapper) {
  return wrapper.find('.media-selection-bar [role="toolbar"]')
}

function barButton(wrapper: VueWrapper, label: string) {
  return bar(wrapper).findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label)
}

function focused(): Element | null {
  return document.activeElement
}

async function key(el: Element | Pick<DOMWrapper<Element>, 'element'>, init: KeyboardEventInit) {
  const target = el instanceof Element ? el : el.element
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  await nextTick()
}

describe('MediaLibrary selection in the grid', () => {
  it('puts a labelled checkbox beside every tile button, never inside it, and selects with it', async () => {
    serve({ folders: ['docs'], files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    const box = checkbox(wrapper, 'a.jpg')
    expect(box.element.closest('button')).toBeNull()
    expect(box.element.closest('.media-grid__cell')?.querySelector('[data-test="file-f1"]')).toBeTruthy()
    expect(checkbox(wrapper, 'docs').exists()).toBe(true)

    await box.setValue(true)
    expect(wrapper.get('[data-test="file-f1"]').classes()).toContain('is-selected')
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-pressed')).toBe('true')
    expect(box.element.checked).toBe(true)
  })

  it('replaces the toolbar with the selection bar in place, keeps the upload status region, and brings the toolbar back on clear', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))
    expect(bar(wrapper).exists()).toBe(false)

    const status = wrapper.get('.ui-live-status')
    expect(status.attributes('role')).toBe('status')
    expect(status.text()).toBe('')

    await checkbox(wrapper, 'a.jpg').setValue(true)

    expect(wrapper.get('.media-toolbar').classes()).toContain('media-library__covered')
    expect(bar(wrapper).attributes('aria-label')).toBe(en['media.selection.count'])
    expect(wrapper.get('.ui-live-status').element).toBe(status.element)
    expect(status.text()).toBe(en['media.selection.count'])
    expect(wrapper.find('.media-library__follow-up[role="status"]').exists()).toBe(true)
    const tools = wrapper.get('.media-library__tools').element
    expect(wrapper.find('.media-pathbar').element.nextElementSibling).toBe(tools)
    expect(wrapper.get('.media-selection-bar').element.parentElement).toBe(tools)
    expect(wrapper.get('.media-toolbar').element.parentElement).toBe(tools)

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 2 }))

    await barButton(wrapper, text('media.selection.selectAllOnPage', { n: 3 }))?.trigger('click')
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 3 }))
    expect(barButton(wrapper, text('media.selection.selectAllOnPage', { n: 3 }))).toBeUndefined()

    await barButton(wrapper, en['media.selection.clear'])?.trigger('click')
    expect(bar(wrapper).exists()).toBe(false)
    expect(wrapper.get('.media-toolbar').classes()).not.toContain('media-library__covered')
    expect(status.text()).toBe(en['media.selection.cleared'])
  })

  it('toggles a folder on click while anything is selected instead of opening it', async () => {
    serve({ folders: ['docs'], files: { '': [media('f1', 'a.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await checkbox(wrapper, 'a.jpg').setValue(true)
    await wrapper.get('[data-test="folder-docs"]').trigger('click')

    expect(wrapper.get('[data-test="folder-docs"]').attributes('aria-pressed')).toBe('true')
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 2 }))
  })

  it('renders no delete action in the bar without the delete capability', async () => {
    schema.capabilities = { listMediaFolders: fullCapabilities.listMediaFolders!, listMedia: fullCapabilities.listMedia! }
    serve({ files: { '': [media('f1', 'a.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await checkbox(wrapper, 'a.jpg').setValue(true)

    expect(bar(wrapper).exists()).toBe(true)
    expect(barButton(wrapper, en['media.selection.delete'])).toBeUndefined()
  })

  it('opens the delete dialog for the selection from the bar', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await checkbox(wrapper, 'a.jpg').setValue(true)
    await checkbox(wrapper, 'b.jpg').setValue(true)
    await barButton(wrapper, en['media.selection.delete'])?.trigger('click')

    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')?.textContent).toContain('2 files'))
  })

  it('keeps the rest of the selection after a refresh instead of clearing it', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')] } })
    serveDelete('f1')
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))

    await checkbox(wrapper, 'b.jpg').setValue(true)
    await wrapper.get('[data-test="file-f1"]').trigger('dblclick')
    const remove = await vi.waitFor(() => {
      const button = document.body.querySelector<HTMLElement>('.media-viewer__delete')
      if (!button) throw new Error('no viewer delete')
      return button
    })
    remove.click()
    await vi.waitFor(() => expect(Array.from(document.body.querySelectorAll('.ui-dialog__content')).some((d) => d.textContent?.includes('Delete 1 file'))).toBe(true))
    const confirmDelete = Array.from(document.body.querySelectorAll('.ui-dialog__content button')).find((b) => b.textContent?.trim() === text('media.remove.confirm.delete', { what: '1 file' }))
    confirmDelete?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))
    expect(wrapper.get('[data-test="file-f2"]').attributes('aria-pressed')).toBe('true')
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(en['media.selection.count'])
  })

  it('prunes the selection to the listed items when the folder changes', async () => {
    serve({ folders: ['docs'], files: { '': [media('f1', 'a.jpg')], docs: [media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary({ pick: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.get('.media-pick-bar').text()).toContain(en['media.pick.count'])
    await wrapper.get('[data-test="folder-docs"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    expect(wrapper.get('.media-pick-bar').text()).toContain(text('media.pick.countPlural', { n: 0 }))
  })
})

describe('MediaLibrary selection in the table', () => {
  beforeEach(() => { localStorage.setItem('kestrel-media-view', 'table') })
  afterEach(() => { localStorage.removeItem('kestrel-media-view') })

  it('adds a checkbox column with a header checkbox that is indeterminate for part of the page, and keeps a plain table whose checkboxes carry the state', async () => {
    serve({ folders: ['docs'], files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="row-file-f2"]').exists()).toBe(true))

    const table = wrapper.get('table')
    expect(table.attributes('role')).toBeUndefined()
    expect(table.attributes('aria-multiselectable')).toBeUndefined()
    const header = wrapper.get<HTMLInputElement>(`thead input[aria-label="${en['media.selection.selectAllPage']}"]`)
    expect(header.element.checked).toBe(false)
    expect(header.element.indeterminate).toBe(false)

    await checkbox(wrapper, 'a.jpg').setValue(true)
    expect(wrapper.get('[data-test="row-file-f1"]').classes()).toContain('is-selected')
    expect(wrapper.findAll('tr[aria-selected]')).toHaveLength(0)
    expect(checkbox(wrapper, 'a.jpg').element.checked).toBe(true)
    expect(checkbox(wrapper, 'b.jpg').element.checked).toBe(false)
    expect(header.element.indeterminate).toBe(true)

    await header.setValue(true)
    expect(header.element.checked).toBe(true)
    expect(header.element.indeterminate).toBe(false)
    expect(checkbox(wrapper, 'docs').element.checked).toBe(true)

    await header.setValue(false)
    expect(bar(wrapper).exists()).toBe(false)
  })

  it('moves focus between rows with the arrow keys and toggles with Space, keeping one tab stop', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="row-file-f2"]').exists()).toBe(true))

    const rows = wrapper.findAll('tbody tr')
    expect(rows.map((r) => r.attributes('tabindex'))).toEqual(['0', '-1'])
    boundaryCast<HTMLElement>(rows[0]!.element, 'dom').focus()

    await key(rows[0]!, { key: 'ArrowDown' })
    expect(focused()).toBe(rows[1]!.element)
    expect(wrapper.findAll('tbody tr').map((r) => r.attributes('tabindex'))).toEqual(['-1', '0'])

    await key(rows[1]!, { key: ' ' })
    expect(checkbox(wrapper, 'b.jpg').element.checked).toBe(true)
  })

  it('opens the delete dialog for the selection with Delete while focus sits on a row checkbox', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="row-file-f2"]').exists()).toBe(true))

    const box = checkbox(wrapper, 'b.jpg')
    box.element.focus()
    await box.setValue(true)
    await key(box, { key: 'Delete' })

    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')?.textContent).toContain('1 file'))
  })
})

describe('MediaLibrary keyboard selection', () => {
  function tiles(wrapper: VueWrapper) {
    return wrapper.findAll('[data-roving-key]')
  }

  it('keeps one tab stop in the grid and moves it with the arrow keys, by row with up and down', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg'), media('f4', 'd.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f4"]').exists()).toBe(true))
    boundaryCast<HTMLElement>(wrapper.get('.media-grid').element, 'dom').style.gridTemplateColumns = '100px 100px 100px'

    expect(tiles(wrapper).map((t) => t.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
    for (const box of wrapper.findAll('.media-grid input[type="checkbox"]')) expect(box.attributes('tabindex')).toBe('-1')
    const first = tiles(wrapper)[0]!
    boundaryCast<HTMLElement>(first.element, 'dom').focus()

    await key(first, { key: 'ArrowRight' })
    expect(focused()).toBe(wrapper.get('[data-test="file-f2"]').element)
    await key(focused()!, { key: 'ArrowDown' })
    expect(focused()).toBe(wrapper.get('[data-test="file-f2"]').element)
    await key(focused()!, { key: 'ArrowLeft' })
    await key(focused()!, { key: 'ArrowDown' })
    expect(focused()).toBe(wrapper.get('[data-test="file-f4"]').element)
    await key(focused()!, { key: 'ArrowUp' })
    expect(focused()).toBe(wrapper.get('[data-test="file-f1"]').element)
    expect(tiles(wrapper).map((t) => t.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
  })

  it('toggles with Space, extends with Shift+arrow, selects the page with Ctrl+A and clears with Escape', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))
    const first = wrapper.get('[data-test="file-f1"]')
    boundaryCast<HTMLElement>(first.element, 'dom').focus()

    await key(first, { key: ' ' })
    expect(first.attributes('aria-pressed')).toBe('true')
    await key(first, { key: ' ' })
    expect(first.attributes('aria-pressed')).toBe('false')

    await key(first, { key: ' ' })
    await key(first, { key: 'ArrowRight', shiftKey: true })
    expect(focused()).toBe(wrapper.get('[data-test="file-f2"]').element)
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 2 }))

    await key(focused()!, { key: 'Escape' })
    expect(bar(wrapper).exists()).toBe(false)

    await key(focused()!, { key: 'a', ctrlKey: true })
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 3 }))
    await key(focused()!, { key: 'a', metaKey: true })
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 3 }))
  })

  it('opens the delete dialog for the selection with Delete or Backspace', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    const first = wrapper.get('[data-test="file-f1"]')
    boundaryCast<HTMLElement>(first.element, 'dom').focus()

    await key(first, { key: ' ' })
    await key(first, { key: 'Delete' })
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')?.textContent).toContain('1 file'))
  })

  it('deletes the selection with Delete while focus sits on a tile outside it', async () => {
    serve({ files: { '': [media('f1', 'sand.jpg'), media('f2', 'dusk.jpg'), media('f3', 'glacier.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))
    const first = wrapper.get('[data-test="file-f1"]')
    boundaryCast<HTMLElement>(first.element, 'dom').focus()

    await key(first, { key: ' ' })
    await key(first, { key: 'ArrowRight' })
    await key(focused()!, { key: ' ' })
    await key(focused()!, { key: 'ArrowRight' })
    expect(focused()).toBe(wrapper.get('[data-test="file-f3"]').element)
    await key(focused()!, { key: 'Delete' })

    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')?.textContent).toContain('2 files'))
    const listed = document.body.querySelector('.media-remove__preview')?.textContent ?? ''
    expect(listed).toContain('sand.jpg')
    expect(listed).toContain('dusk.jpg')
    expect(listed).not.toContain('glacier.jpg')
  })

  it('takes the selection keys and the arrows while focus sits on a tile checkbox', async () => {
    serve({ files: { '': [media('f1', 'a.jpg'), media('f2', 'b.jpg'), media('f3', 'c.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))

    const box = checkbox(wrapper, 'a.jpg')
    box.element.focus()
    await box.setValue(true)
    await key(box, { key: 'a', ctrlKey: true })
    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(text('media.selection.countPlural', { n: 3 }))
    await key(box, { key: 'Escape' })
    expect(bar(wrapper).exists()).toBe(false)

    await key(box, { key: 'ArrowRight' })
    expect(focused()).toBe(wrapper.get('[data-test="file-f2"]').element)

    const second = checkbox(wrapper, 'b.jpg')
    second.element.focus()
    await second.setValue(true)
    await key(second, { key: 'Backspace' })
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')?.textContent).toContain('1 file'))
    expect(document.body.querySelector('.media-remove__preview')?.textContent).toContain('b.jpg')
  })

  it('ignores the keys while typing in the search field', async () => {
    serve({ files: { '': [media('f1', 'a.jpg')] } })
    const wrapper = await mountLibrary()
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    await key(wrapper.get('input[type="search"]'), { key: 'a', ctrlKey: true })
    expect(bar(wrapper).exists()).toBe(false)
  })
})

describe('MediaLibrary multi-pick selection', () => {
  function useSelectedButton(wrapper: VueWrapper) {
    const button = wrapper.findAll('button').find((b) => b.text() === en['media.useSelected'])
    if (!button) throw new Error('expected a "Use selected" button')
    return button
  }

  it('drops a deleted pick so it is never confirmed into the field', async () => {
    const f1 = media('f1', 'a.jpg')
    const f2 = media('f2', 'b.jpg')
    serve({ files: { '': [f1, f2] } }, (id) => ({ f1, f2 })[id])
    serveDelete('f1')
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(bar(wrapper).exists()).toBe(true)
    await barButton(wrapper, en['media.selection.delete'])?.trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const confirmDelete = Array.from(document.body.querySelectorAll('.ui-dialog__content button')).find((b) => b.textContent?.trim() === text('media.remove.confirm.delete', { what: '1 file' }))
    confirmDelete?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f2']]]))
  })

  it('refuses a pick that no longer exists, names it, removes it, and confirms the rest on the next try', async () => {
    const f1 = media('f1', 'gone.jpg')
    const f2 = media('f2', 'kept.jpg')
    serve({ files: { '': [f1, f2] } }, (id) => ({ f2 })[id])
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain(text('media.pick.missing', { names: 'gone.jpg' })))
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-pressed')).toBe('false')

    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f2']]]))
  })

  it('checks the picks in blocks the server answers in full, so no pick past its id cap counts as gone', async () => {
    const all = Array.from({ length: 5 }, (_, i) => media(`f${i}`, `${i}.jpg`))
    const byId = new Map(all.map((f) => [f.id, f]))
    serve({ files: { '': all } }, (id) => byId.get(id), 2)
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f4"]').exists()).toBe(true))

    for (const f of all) await wrapper.get(`[data-test="file-${f.id}"]`).trigger('click')
    await useSelectedButton(wrapper).trigger('click')

    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[all.map((f) => f.id)]]))
    expect(wrapper.text()).not.toContain(en['media.pick.missing'].split(':')[0])
  })

  it('shows the bar with only the visible picks and keeps search reachable', async () => {
    const f1 = media('f1', 'a.jpg')
    serve({ files: { '': [f1] } }, (id) => ({ f1 })[id])
    const wrapper = await mountLibrary({ pick: true, multiple: true, initialSelected: ['elsewhere', 'f1'] })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    expect(bar(wrapper).get('.ui-bulkbar__count').text()).toBe(en['media.selection.countHere'])
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    expect(wrapper.get('.media-pick-bar').text()).toContain(text('media.pick.countPlural', { n: 2 }))
  })

  it('leaves the picks alone when Delete is pressed on a folder, which a multi-pick cannot select', async () => {
    serve({ folders: ['events'], files: { '': [media('f1', 'dusk.png'), media('f2', 'harbour.png')] } })
    serveDelete('f1')
    serveDelete('f2')
    const wrapper = await mountLibrary({ pick: true, multiple: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-events"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f1"]').trigger('click')
    await wrapper.get('[data-test="file-f2"]').trigger('click')

    const folder = wrapper.get('[data-test="folder-events"]')
    boundaryCast<HTMLElement>(folder.element, 'dom').focus()
    await key(folder, { key: 'Delete' })
    await key(folder, { key: 'Backspace' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(document.body.querySelector('.ui-dialog__content')).toBeNull()
    expect(deleted).toEqual([])
    expect(wrapper.get('.media-pick-bar').text()).toContain(text('media.pick.countPlural', { n: 2 }))
  })

  it('has no checkboxes when picking a single file', async () => {
    serve({ files: { '': [media('f1', 'a.jpg')] } })
    const wrapper = await mountLibrary({ pick: true })
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    expect(wrapper.find('.media-grid input[type="checkbox"]').exists()).toBe(false)
    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(bar(wrapper).exists()).toBe(false)
  })
})
