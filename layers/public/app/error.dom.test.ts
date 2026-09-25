import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorPage from './error.vue'

describe('the error page', () => {
  afterEach(() => {
    document.body.classList.remove('site-body')
  })

  it('marks the body as the site\'s while it shows an error of a site page', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: { statusCode: 404 } }, route: '/fehlt', attachTo: document.body })
    await vi.waitFor(() => expect(document.body.classList.contains('site-body')).toBe(true))
    wrapper.unmount()
    await vi.waitFor(() => expect(document.body.classList.contains('site-body')).toBe(false))
  })

  it('leaves the body alone for an error on an admin page', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: { statusCode: 500 } }, route: '/admin/pages', attachTo: document.body })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.body.classList.contains('site-body')).toBe(false)
    wrapper.unmount()
  })
})
