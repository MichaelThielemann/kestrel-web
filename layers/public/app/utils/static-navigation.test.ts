import { describe, expect, it, vi } from 'vitest'
import type { PageData } from './page-data'
import { createStaticNavigation, leaveForDocument, type StaticNavigationApp } from './static-navigation'

function app(data: Record<string, unknown> = {}): StaticNavigationApp {
  return { isHydrating: false, static: { data } }
}

function route(path: string, fullPath = path) {
  return { path, fullPath }
}

const never = () => new Promise<never>(() => {})

async function settlesWithin(promise: Promise<unknown>, ms = 20): Promise<boolean> {
  return Promise.race([promise.then(() => true, () => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))])
}

describe('static navigation', () => {
  it('does nothing while the app hydrates', async () => {
    const load = vi.fn(() => Promise.resolve(null))
    const target = { ...app(), isHydrating: true }
    await createStaticNavigation({ app: target, load, leave: never })(route('/about'), route('/about'))
    expect(load).not.toHaveBeenCalled()
  })

  it('does nothing when the site path stays the same', async () => {
    const load = vi.fn(() => Promise.resolve(null))
    const navigate = createStaticNavigation({ app: app(), load, leave: never })
    await navigate(route('/about', '/about#team'), route('/about/'))
    expect(load).not.toHaveBeenCalled()
  })

  it('loads the target\'s site path and puts its data where useAsyncData looks first', async () => {
    const target = app()
    const page: PageData = { path: '/about', data: { 'site:/about': { id: 'p1' }, 'site:settings:de': { title: 'Site' } } }
    const load = vi.fn(() => Promise.resolve(page))
    await createStaticNavigation({ app: target, load, leave: never })(route('/about/'), route('/'))
    expect(load).toHaveBeenCalledWith('/about')
    expect(target.static.data).toEqual(page.data)
  })

  it('removes the data the previous navigation added and keeps what was there before', async () => {
    const target = app({ own: 1 })
    const pages: Record<string, PageData> = {
      '/about': { path: '/about', data: { 'site:/about': 1, 'shared': 'a', 'own': 2 } },
      '/contact': { path: '/contact', data: { 'site:/contact': 3, 'shared': 'b' } },
      '/': { path: '/', data: { 'site:/': 4 } },
    }
    const navigate = createStaticNavigation({ app: target, load: (path) => Promise.resolve(pages[path] ?? null), leave: never })

    await navigate(route('/about'), route('/'))
    await navigate(route('/contact'), route('/about'))
    expect(target.static.data).toEqual({ own: 2, 'site:/contact': 3, 'shared': 'b' })

    await navigate(route('/'), route('/contact'))
    expect(target.static.data).toEqual({ own: 2, 'site:/': 4 })
  })

  it('applies the target\'s data only, never its state', async () => {
    const target = app()
    const page = { path: '/about', data: { 'site:/about': 1 }, state: { 'site:page': 'x' } }
    await createStaticNavigation({ app: target, load: () => Promise.resolve(page), leave: never })(route('/about'), route('/'))
    expect(target.static.data).toEqual({ 'site:/about': 1 })
  })

  it('leaves for a document load of the full target when the data cannot be used, and never settles', async () => {
    const target = app({ own: 1 })
    const leave = vi.fn(never)
    const navigation = createStaticNavigation({ app: target, load: () => Promise.resolve(null), leave })(route('/missing', '/missing?x=1#top'), route('/'))
    expect(await settlesWithin(navigation)).toBe(false)
    expect(leave).toHaveBeenCalledWith('/missing?x=1#top')
    expect(target.static.data).toEqual({ own: 1 })
  })
})

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

describe('static navigation when a newer navigation starts before a load settles', () => {
  function pages(): Record<string, PageData> {
    return {
      '/kontakt': { path: '/kontakt', data: { 'site:/kontakt': 'kontakt', 'media:m1:de': 'kontakt image' } },
      '/ueber-uns': { path: '/ueber-uns', data: { 'site:/ueber-uns': 'ueber-uns', 'media:m2:de': 'ueber-uns image' } },
    }
  }

  it('drops a superseded load that succeeds late, leaving the newer page\'s data alone', async () => {
    const target = app()
    const slow = deferred<PageData | null>()
    const leave = vi.fn(never)
    const load = vi.fn((path: string) => (path === '/kontakt' ? slow.promise : Promise.resolve(pages()[path] ?? null)))
    const navigate = createStaticNavigation({ app: target, load, leave })

    const first = navigate(route('/kontakt'), route('/'))
    await expect(navigate(route('/ueber-uns'), route('/'))).resolves.toBeUndefined()
    slow.resolve(pages()['/kontakt'] ?? null)

    await expect(first).resolves.toBe(false)
    expect(target.static.data).toEqual({ 'site:/ueber-uns': 'ueber-uns', 'media:m2:de': 'ueber-uns image' })
    expect(leave).not.toHaveBeenCalled()
  })

  it('drops a superseded load that fails late instead of leaving for the abandoned target', async () => {
    const target = app()
    const slow = deferred<PageData | null>()
    const leave = vi.fn(never)
    const load = vi.fn((path: string) => (path === '/kontakt' ? slow.promise : Promise.resolve(pages()[path] ?? null)))
    const navigate = createStaticNavigation({ app: target, load, leave })

    const first = navigate(route('/kontakt'), route('/'))
    await navigate(route('/ueber-uns'), route('/'))
    slow.resolve(null)

    await expect(first).resolves.toBe(false)
    expect(leave).not.toHaveBeenCalled()
    expect(target.static.data).toEqual({ 'site:/ueber-uns': 'ueber-uns', 'media:m2:de': 'ueber-uns image' })
  })

  it('keeps a newer page that settles after an older one too', async () => {
    const target = app()
    const older = deferred<PageData | null>()
    const newer = deferred<PageData | null>()
    const load = vi.fn((path: string) => (path === '/kontakt' ? older.promise : newer.promise))
    const navigate = createStaticNavigation({ app: target, load, leave: never })

    const first = navigate(route('/kontakt'), route('/'))
    const second = navigate(route('/ueber-uns'), route('/'))
    older.resolve(pages()['/kontakt'] ?? null)
    await expect(first).resolves.toBe(false)
    newer.resolve(pages()['/ueber-uns'] ?? null)
    await expect(second).resolves.toBeUndefined()
    expect(target.static.data).toEqual({ 'site:/ueber-uns': 'ueber-uns', 'media:m2:de': 'ueber-uns image' })
  })

  it('drops a pending load when Back starts another navigation, so the abandoned target is never loaded as a document', async () => {
    const target = app()
    const slow = deferred<PageData | null>()
    const leave = vi.fn(never)
    const load = vi.fn((path: string) => (path === '/kontakt' ? slow.promise : Promise.resolve(pages()[path] ?? null)))
    const navigate = createStaticNavigation({ app: target, load, leave })

    const click = navigate(route('/kontakt'), route('/'))
    await navigate(route('/ueber-uns'), route('/'))
    slow.resolve(null)

    await expect(click).resolves.toBe(false)
    expect(leave).not.toHaveBeenCalled()
  })

  it('treats a navigation on the same page, such as a hash link, as newer than a pending load', async () => {
    const target = app()
    const slow = deferred<PageData | null>()
    const leave = vi.fn(never)
    const navigate = createStaticNavigation({ app: target, load: () => slow.promise, leave })

    const pending = navigate(route('/kontakt'), route('/'))
    await navigate(route('/', '/#top'), route('/'))
    slow.resolve(null)

    await expect(pending).resolves.toBe(false)
    expect(leave).not.toHaveBeenCalled()
    expect(target.static.data).toEqual({})
  })
})

describe('leaving for a document load', () => {
  function location(pathname: string, search = '') {
    return { pathname, search, assign: vi.fn(), reload: vi.fn() }
  }

  it('assigns the target URL after a click, so the history keeps the entry a plain link would add', async () => {
    const loc = location('/about')
    const left = leaveForDocument('/', '/contact?x=1#team', loc)
    expect(loc.assign).toHaveBeenCalledWith('/contact?x=1#team')
    expect(loc.reload).not.toHaveBeenCalled()
    expect(await settlesWithin(left)).toBe(false)
  })

  it('reloads when the browser already shows the target, as after Back or Forward', async () => {
    const loc = location('/contact', '?x=1')
    const left = leaveForDocument('/', '/contact?x=1#team', loc)
    expect(loc.reload).toHaveBeenCalledTimes(1)
    expect(loc.assign).not.toHaveBeenCalled()
    expect(await settlesWithin(left)).toBe(false)
  })

  it('puts the app base URL in front of the target', () => {
    const loc = location('/sub/about')
    void leaveForDocument('/sub/', '/contact', loc)
    expect(loc.assign).toHaveBeenCalledWith('/sub/contact')
  })
})
