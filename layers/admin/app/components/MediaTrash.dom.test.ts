import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, MediaTrashItem } from '#kestrel-admin/types/api'
import { notifyMediaChanged } from '../composables/useMediaChanges'
import MediaTrash from './MediaTrash.vue'

const capabilities: AdminSchema['capabilities'] = {
  listMediaTrash: { method: 'GET', path: '/media/trash' },
  restoreMedia: { method: 'POST', path: '/media/trash/restore' },
  purgeMedia: { method: 'POST', path: '/media/trash/purge' },
  emptyMediaTrash: { method: 'POST', path: '/media/trash/empty' },
}
const schema: AdminSchema = { locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: [], capabilities: { ...capabilities } }
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

const DAY = 86_400_000

function trashedItem(id: string, filename: string, folder = ''): MediaTrashItem {
  const trashedAt = Date.now() - DAY
  return {
    id, filename, folder, contentType: 'image/png', size: 2048, path: null, trashedAt, expiresAt: trashedAt + 30 * DAY,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null, description: null,
  }
}

const text = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce<string>((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key])

const unregisterAll: (() => void)[] = []
const posted: { path: string; body: unknown }[] = []
let items: MediaTrashItem[] = []
let gate: Promise<void> | null = null

function post(path: string, answer: (ids: string[]) => unknown) {
  unregisterAll.push(registerEndpoint(`/api${path}`, {
    method: 'POST',
    handler: async (event) => {
      const body = boundaryCast<{ ids?: string[] }>(await readBody(event), 'json')
      posted.push({ path, body })
      if (gate) await gate
      return answer(body.ids ?? items.map((item) => item.id))
    },
  }))
}

beforeEach(async () => {
  posted.length = 0
  gate = null
  items = [trashedItem('f1', 'a.png', 'docs'), trashedItem('f2', 'b.png')]
  useToast().clear()
  schema.capabilities = { ...capabilities }
  unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
  unregisterAll.push(registerEndpoint('/api/media/trash', { method: 'GET', handler: () => ({ items, total: items.length }) }))
  post('/media/trash/restore', (ids) => {
    items = items.filter((item) => !ids.includes(item.id))
    return { ids, skipped: [], renamed: [], unchanged: [], trashVersions: {} }
  })
  post('/media/trash/purge', (ids) => {
    const kept: string[] = ids.filter((id) => id === 'f2')
    items = items.filter((item) => !ids.includes(item.id) || kept.includes(item.id))
    return { ids: ids.filter((id) => !kept.includes(id)), skipped: kept.map((id) => ({ id, reason: 'referenced' })) }
  })
  post('/media/trash/empty', (ids) => {
    items = []
    return { ids, skipped: [] }
  })
  await useSchema().load()
})

afterEach(() => {
  unregisterAll.splice(0).forEach((unregister) => unregister())
})

async function mountTrash() {
  const wrapper = await mountSuspended(MediaTrash, { attachTo: document.body })
  onTestFinished(() => wrapper.unmount())
  await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(items.length))
  return wrapper
}

async function select(wrapper: VueWrapper, name: string) {
  const box = wrapper.findAll<HTMLInputElement>('tbody input[type="checkbox"]').find((b) => b.attributes('aria-label') === text('media.selection.selectItem', { name }))
  await box?.setValue(true)
}

const button = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label)
const dialog = () => document.body.querySelector('.ui-dialog__content')
const dialogButton = (label: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ui-dialog__content button')).find((b) => b.textContent?.trim() === label)

describe('MediaTrash', () => {
  it('lists each item with its folder and when it is deleted for good', async () => {
    const wrapper = await mountTrash()
    const first = wrapper.findAll('tbody tr')[0]
    expect(first?.text()).toContain('a.png')
    expect(first?.text()).toContain('docs')
    expect(first?.find('time').text()).toBe(new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(29, 'day'))
    expect(wrapper.findAll('tbody tr')[1]?.text()).toContain(en['media.trash.rootFolder'])
  })

  it('restores the selection at once', async () => {
    const wrapper = await mountTrash()
    await select(wrapper, 'a.png')
    await button(wrapper, en['media.trash.restore'])?.trigger('click')

    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(1))
    expect(posted).toEqual([{ path: '/media/trash/restore', body: { ids: ['f1'] } }])
    expect(useToast().items.some((item) => item.message === en['media.trash.restored'])).toBe(true)
  })

  it('deletes for good only after a dialog that starts on Cancel, and reports an item still in use as kept', async () => {
    const wrapper = await mountTrash()
    await select(wrapper, 'a.png')
    await select(wrapper, 'b.png')
    await button(wrapper, en['media.trash.purge'])?.trigger('click')

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(text('media.remove.title.purge', { what: text('media.remove.filesPlural', { n: 2 }) })))
    expect(dialog()?.querySelector('img')).toBeNull()
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe(en['common.cancel']))
    expect(posted).toEqual([])

    dialogButton(text('media.remove.confirm.purge', { what: text('media.remove.filesPlural', { n: 2 }) }))?.click()

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    expect(posted).toEqual([{ path: '/media/trash/purge', body: { ids: ['f1', 'f2'] } }])
    expect(dialog()?.textContent).toContain('b.png')
    expect(dialog()?.textContent).toContain(en['media.trash.reason.referenced'])
    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(1))
  })

  it('empties the trash after a dialog', async () => {
    const wrapper = await mountTrash()
    await button(wrapper, en['media.trash.emptyAll'])?.trigger('click')
    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.empty']))

    dialogButton(en['media.remove.confirm.empty'])?.click()

    await vi.waitFor(() => expect(wrapper.text()).toContain(en['media.trash.empty']))
    expect(posted).toEqual([{ path: '/media/trash/empty', body: {} }])
  })

  it('shows neither restore nor delete to a role without them', async () => {
    schema.capabilities = { listMediaTrash: capabilities.listMediaTrash! }
    const wrapper = await mountTrash()
    await select(wrapper, 'a.png')
    expect(button(wrapper, en['media.trash.restore'])).toBeUndefined()
    expect(button(wrapper, en['media.trash.purge'])).toBeUndefined()
    expect(button(wrapper, text('media.trash.restoreItem', { name: 'a.png' }))).toBeUndefined()
  })

  it('moves focus to the next row after a row is restored, and to the heading once the trash is empty', async () => {
    const wrapper = await mountTrash()
    const restoreA = button(wrapper, text('media.trash.restoreItem', { name: 'a.png' }))
    boundaryCast<HTMLElement>(restoreA?.element, 'dom').focus()
    await restoreA?.trigger('click')

    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(1))
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe(text('media.selection.selectItem', { name: 'b.png' })))

    const restoreB = button(wrapper, text('media.trash.restoreItem', { name: 'b.png' }))
    boundaryCast<HTMLElement>(restoreB?.element, 'dom').focus()
    await restoreB?.trigger('click')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe(en['media.trash.title']))
  })

  it('puts focus back on a row when a change made elsewhere removes the row that held it', async () => {
    const wrapper = await mountTrash()
    const boxA = wrapper.findAll<HTMLInputElement>('tbody input[type="checkbox"]').find((b) => b.attributes('aria-label') === text('media.selection.selectItem', { name: 'a.png' }))
    boundaryCast<HTMLElement>(boxA?.element, 'dom').focus()

    items = items.filter((item) => item.id !== 'f1')
    await notifyMediaChanged({ restored: ['f1'] })

    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(1))
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe(text('media.selection.selectItem', { name: 'b.png' })))
  })

  it('reports nothing for an item already gone when it is deleted for good', async () => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/media/trash', { method: 'GET', handler: () => ({ items, total: items.length }) }))
    post('/media/trash/purge', (ids) => {
      items = items.filter((item) => !ids.includes(item.id))
      return { ids: ids.filter((id) => id !== 'f2'), skipped: [{ id: 'f2', reason: 'not_found' }] }
    })
    const wrapper = await mountTrash()
    await select(wrapper, 'a.png')
    await select(wrapper, 'b.png')
    await button(wrapper, en['media.trash.purge'])?.trigger('click')
    await vi.waitFor(() => expect(dialog()).toBeTruthy())
    dialogButton(text('media.remove.confirm.purge', { what: text('media.remove.filesPlural', { n: 2 }) }))?.click()

    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(0))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('announces the selection count in a status region that stays mounted', async () => {
    const wrapper = await mountTrash()
    const status = wrapper.get('.ui-live-status')

    await select(wrapper, 'a.png')
    expect(status.text()).toBe(en['media.selection.count'])
    await button(wrapper, en['media.selection.clear'])?.trigger('click')
    expect(wrapper.get('.ui-live-status').element).toBe(status.element)
    expect(status.text()).toBe(en['media.selection.cleared'])
  })

  it('shows the page asked for last when an earlier page answers later', async () => {
    const many = Array.from({ length: 60 }, (_, i) => trashedItem(`t${i}`, `t${i}.png`))
    let releaseSecond = () => {}
    const second = new Promise<void>((resolve) => { releaseSecond = resolve })
    unregisterAll.push(registerEndpoint('/api/media/trash', {
      method: 'GET',
      handler: async (event) => {
        const offset = Number(getQuery(event).offset ?? 0)
        if (offset === 25) await second
        return { items: many.slice(offset, offset + 25), total: many.length }
      },
    }))
    const wrapper = await mountSuspended(MediaTrash, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(25))

    await button(wrapper, en['list.next'])?.trigger('click')
    await button(wrapper, en['list.next'])?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('t50.png'))
    releaseSecond()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(wrapper.text()).toContain('t50.png')
    expect(wrapper.text()).not.toContain('t25.png')
  })

  it('leads back to the folder the trash was opened from', async () => {
    const wrapper = await mountSuspended(MediaTrash, { attachTo: document.body, route: '/?trash=1&folder=events' })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.get('[data-test="media-trash-back"]').attributes('href')).toBe('/admin/media?folder=events'))
  })

  it('keeps Cancel, disabled, while a single request runs, since nothing is left to stop between requests', async () => {
    let release = () => {}
    gate = new Promise((resolve) => { release = resolve })
    const wrapper = await mountTrash()
    await button(wrapper, en['media.trash.emptyAll'])?.trigger('click')
    await vi.waitFor(() => expect(dialog()).toBeTruthy())
    dialogButton(en['media.remove.confirm.empty'])?.click()
    await vi.waitFor(() => expect(posted).toHaveLength(1))

    expect(dialogButton(en['media.remove.stop'])).toBeUndefined()
    const cancel = document.body.querySelector<HTMLButtonElement>('[data-test="remove-cancel"]')
    expect(cancel?.textContent?.trim()).toBe(en['common.cancel'])
    expect(cancel?.disabled).toBe(true)

    release()
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('names a failed empty after the trash, not with an empty title', async () => {
    unregisterAll.push(registerEndpoint('/api/media/trash/empty', { method: 'POST', handler: () => { throw createError({ statusCode: 503, statusMessage: 'unavailable' }) } }))
    const wrapper = await mountTrash()
    await button(wrapper, en['media.trash.emptyAll'])?.trigger('click')
    dialogButton(en['media.remove.confirm.empty'])?.click()

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    const titles = Array.from(dialog()?.querySelectorAll('.media-remove__problems .ui-progress-row__title') ?? []).map((el) => el.textContent?.trim())
    expect(titles).toEqual([en['media.trash.title']])
  })

  it('names an item the empty kept by its file name, also when it is not on the page shown', async () => {
    items = Array.from({ length: 30 }, (_, i) => trashedItem(`t${i}`, `t${i}.png`))
    unregisterAll.push(registerEndpoint('/api/media/trash', {
      method: 'GET',
      handler: (event) => {
        const query = getQuery(event)
        const offset = Number(query.offset ?? 0)
        const limit = Number(query.limit ?? 25)
        return { items: items.slice(offset, offset + limit), total: items.length }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/media/trash/empty', {
      method: 'POST',
      handler: () => {
        const kept = items.filter((item) => item.id === 't29')
        const ids = items.filter((item) => item.id !== 't29').map((item) => item.id)
        items = [...items.slice(0, 26).filter((item) => item.id !== 't29'), ...kept]
        return { ids, skipped: kept.map((item) => ({ id: item.id, reason: 'referenced' })) }
      },
    }))
    const wrapper = await mountSuspended(MediaTrash, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(25))
    await button(wrapper, en['media.trash.emptyAll'])?.trigger('click')
    dialogButton(en['media.remove.confirm.empty'])?.click()

    await vi.waitFor(() => expect(dialog()?.textContent).toContain(en['media.remove.title.partial']))
    await vi.waitFor(() => expect(dialog()?.querySelector('.media-remove__problems')?.textContent).toContain('t29.png'))
  })

  it('says an item in use stays instead of promising a date, and an expired one goes with the next cleanup', async () => {
    schema.capabilities.mediaReferrersMany = { method: 'GET', path: '/admin/references/to/media' }
    unregisterAll.push(registerEndpoint('/api/admin/references/to/media', { method: 'GET', handler: () => ({ f2: [{ type: 'pages', field: 'hero', id: 'p1' }] }) }))
    items = [{ ...trashedItem('f1', 'a.png'), expiresAt: Date.now() - DAY }, trashedItem('f2', 'b.png')]
    const wrapper = await mountTrash()

    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')[1]?.text()).toContain(en['media.trash.keptInUse']))
    expect(wrapper.findAll('tbody tr')[1]?.find('time').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')[0]?.text()).toContain(en['media.trash.expiresNext'])
    expect(wrapper.findAll('tbody tr')[0]?.text()).not.toContain(new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(0, 'day'))
  })
})
