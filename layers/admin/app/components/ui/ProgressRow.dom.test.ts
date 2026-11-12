import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import ProgressRow from './ProgressRow.vue'

const progressRowSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/ui/ProgressRow.vue'), 'utf-8')

class FakeResizeObserver {
  static all: FakeResizeObserver[] = []
  targets: Element[] = []
  disconnected = false
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.all.push(this)
  }

  observe(target: Element) {
    this.targets.push(target)
  }

  disconnect() {
    this.disconnected = true
  }

  fire() {
    this.callback()
  }
}

function measure(element: Element, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(element, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(element, 'clientWidth', { value: clientWidth, configurable: true })
}

describe('KestrelUiProgressRow', () => {
  it('shows the title, the meta text and a status with icon and text', async () => {
    const wrapper = await mountSuspended(ProgressRow, {
      props: { title: 'report-final.pdf', meta: '1.2 MB', status: { text: 'Done', icon: 'circle-check', tone: 'success' } },
    })

    expect(wrapper.get('.ui-progress-row__title').text()).toBe('report-final.pdf')
    expect(wrapper.get('.ui-progress-row__meta').text()).toBe('1.2 MB')
    const status = wrapper.get('.ui-progress-row__status')
    expect(status.text()).toBe('Done')
    expect(status.classes()).toContain('ui-progress-row__status--success')
    expect(status.find('svg[data-icon="circle-check"]').exists()).toBe(true)
  })

  it('renders a thin progress bar only when progress is given', async () => {
    const without = await mountSuspended(ProgressRow, { props: { title: 'a.png' } })
    const withBar = await mountSuspended(ProgressRow, {
      props: { title: 'a.png', progress: { value: 40, label: 'Uploading: a.png', valueText: '40 %' } },
    })

    expect(without.find('[role="progressbar"]').exists()).toBe(false)
    const bar = withBar.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('40')
    expect(bar.attributes('aria-label')).toBe('Uploading: a.png')
    expect(bar.classes()).toContain('ui-progress--sm')
  })

  it('shows a spinner in place of the status icon while busy', async () => {
    const wrapper = await mountSuspended(ProgressRow, { props: { title: 'a.png', status: { text: 'Processing…', icon: 'clock', busy: true } } })

    expect(wrapper.find('.ui-progress-row__status .ui-spinner').exists()).toBe(true)
    expect(wrapper.find('.ui-progress-row__status svg[data-icon="clock"]').exists()).toBe(false)
  })

  it('shows a message line in the row tone without making it an alert', async () => {
    const wrapper = await mountSuspended(ProgressRow, { props: { title: 'a.png', message: 'No connection to the server', tone: 'danger' } })

    const message = wrapper.get('.ui-progress-row__message')
    expect(message.text()).toBe('No connection to the server')
    expect(wrapper.classes()).toContain('ui-progress-row--danger')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('renders the leading, status and actions slots', async () => {
    const wrapper = await mountSuspended(ProgressRow, {
      props: { title: 'a.png', status: { text: 'ignored' } },
      slots: {
        leading: () => h('img', { class: 'thumb', alt: '' }),
        status: () => h('span', { class: 'custom-status' }, 'Custom'),
        actions: () => h('button', { class: 'act' }, 'Retry'),
      },
    })

    expect(wrapper.find('.ui-progress-row__leading .thumb').exists()).toBe(true)
    expect(wrapper.get('.ui-progress-row__status').text()).toBe('Custom')
    expect(wrapper.find('.ui-progress-row__actions .act').exists()).toBe(true)
  })

  it('renders no empty leading or actions box without content', async () => {
    const wrapper = await mountSuspended(ProgressRow, { props: { title: 'a.png' } })

    expect(wrapper.find('.ui-progress-row__leading').exists()).toBe(false)
    expect(wrapper.find('.ui-progress-row__actions').exists()).toBe(false)
  })
})

describe('KestrelUiProgressRow title without hover', () => {
  afterEach(() => {
    FakeResizeObserver.all = []
    vi.unstubAllGlobals()
  })

  it('lets a truncated title take keyboard focus, so its tooltip can show the full name', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const wrapper = await mountSuspended(ProgressRow, { props: { title: 'panorama-of-the-old-town-at-sunset.jpg' } })
    const title = wrapper.get('.ui-progress-row__title')
    expect(title.attributes('tabindex')).toBeUndefined()

    measure(title.element, 400, 120)
    FakeResizeObserver.all.forEach((observer) => observer.fire())
    await nextTick()
    expect(title.attributes('tabindex')).toBe('0')

    measure(title.element, 120, 120)
    FakeResizeObserver.all.forEach((observer) => observer.fire())
    await nextTick()
    expect(title.attributes('tabindex')).toBeUndefined()
  })

  it('stops watching the title size when it unmounts', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const wrapper = await mountSuspended(ProgressRow, { props: { title: 'a.png' } })
    const observers = FakeResizeObserver.all.filter((observer) => observer.targets.includes(wrapper.get('.ui-progress-row__title').element))
    expect(observers).toHaveLength(1)

    wrapper.unmount()
    expect(observers[0]?.disconnected).toBe(true)
  })

  it('wraps the title in narrow rows instead of cutting it off', () => {
    const narrow = progressRowSource.slice(progressRowSource.indexOf('@container (max-width: 28rem)'))
    const titleRule = narrow.slice(narrow.indexOf('.ui-progress-row__title'), narrow.indexOf('}', narrow.indexOf('.ui-progress-row__title')))

    expect(titleRule).toContain('white-space: normal')
    expect(titleRule).toContain('overflow-wrap: anywhere')
  })
})
