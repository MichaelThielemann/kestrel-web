import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getRequestHeader, setResponseHeader, setResponseStatus } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { useSchema } from '../composables/useSchema'
import SystemReferences from './SystemReferences.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    brokenReferences: { method: 'GET', path: '/admin/references/broken' },
    brokenLinks: { method: 'GET', path: '/admin/links/broken' },
  },
}

describe('SystemReferences', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('names the HTTP status and the error id of a report that failed to load', async () => {
    const sent: Record<string, string | undefined> = {}
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/references/broken', {
      method: 'GET',
      handler: (event) => {
        sent.references = getRequestHeader(event, 'x-request-id')
        setResponseStatus(event, 500)
        setResponseHeader(event, 'x-kestrel-run-id', 'run-1')
        return { error: 'index unavailable', code: 'INTERNAL', retryable: false }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/admin/links/broken', {
      method: 'GET',
      handler: (event) => {
        sent.links = getRequestHeader(event, 'x-request-id')
        setResponseStatus(event, 502)
        setResponseHeader(event, 'content-type', 'text/html')
        return '<html>502 Bad Gateway</html>'
      },
    }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemReferences)
    const text = wrapper.text()

    const id = (value: string | undefined) => en['error.id'].replace('{id}', value ?? '')
    expect(text).toContain(`${en['refs.loadError'].replace(/\.$/, '')} (HTTP 500 · ${id(sent.references)})`)
    expect(text).toContain(`${en['references.links.loadError'].replace(/\.$/, '')}. ${en['error.unreached'].replace('{reference}', `HTTP 502 · ${id(sent.links)}`)}`)
    wrapper.unmount()
  })
})
