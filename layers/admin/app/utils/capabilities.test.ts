import { describe, expect, it } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { MissingCapabilityError, apiUrl, capabilityResolver, fillPath, routeFrom } from './capabilities'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  features: [],
  capabilities: {
    deleteUser: { method: 'DELETE', path: '/users/:id' },
    renameMediaFolder: { method: 'PATCH', path: '/media/folders/*path' },
    publishNewsletter: { method: 'POST', path: '/newsletter/publish' },
  },
  collections: [
    {
      name: 'pages',
      mode: 'multi',
      translatable: false,
      routed: true,
      published: true,
      hasSlug: true,
      seo: false,
      status: false,
      layoutField: false,
      blocks: { enabled: false },
      editor: 'fields',
      nav: true,
      placement: 'rail',
      fields: {},
      capabilities: { update: { method: 'PATCH', path: '/pages/:id' } },
    },
  ],
}

describe('fillPath', () => {
  it('throws when a parameter is missing', () => {
    expect(() => fillPath('/users/:id')).toThrow('path "/users/:id" needs parameter "id"')
  })

  it('throws when an extra parameter is unused', () => {
    expect(() => fillPath('/users/:id', { id: 'u1', userId: 'u1' })).toThrow('path "/users/:id" has no parameter "userId"')
  })

  it('throws when a parameter is empty', () => {
    expect(() => fillPath('/users/:id', { id: '' })).toThrow('path "/users/:id" got an empty "id"')
  })

  it('encodes a parameter', () => {
    expect(fillPath('/users/:id', { id: 'a b/c' })).toBe('/users/a%20b%2Fc')
  })

  it('encodes each part of a wildcard parameter', () => {
    expect(fillPath('/media/folders/*path', { path: 'a b/c d' })).toBe('/media/folders/a%20b/c%20d')
  })

  it('throws on a ".." named parameter, which would retarget the request', () => {
    expect(() => fillPath('/users/:id', { id: '..' })).toThrow('path "/users/:id" got a "." or ".." segment in parameter "id"')
  })

  it('throws on a "." named parameter', () => {
    expect(() => fillPath('/users/:id', { id: '.' })).toThrow('path "/users/:id" got a "." or ".." segment in parameter "id"')
  })

  it('throws on a percent-encoded ".." named parameter', () => {
    expect(() => fillPath('/users/:id', { id: '%2e%2e' })).toThrow('path "/users/:id" got a "." or ".." segment in parameter "id"')
  })

  it('throws on a ".." segment inside a wildcard parameter', () => {
    expect(() => fillPath('/media/folders/*path', { path: 'a/../b' })).toThrow('path "/media/folders/*path" got a "." or ".." segment in parameter "path"')
  })

  it('throws on a "." segment inside a wildcard parameter', () => {
    expect(() => fillPath('/media/folders/*path', { path: 'a/./b' })).toThrow('path "/media/folders/*path" got a "." or ".." segment in parameter "path"')
  })
})

describe('routeFrom', () => {
  it('fills the capability path with the given parameters', () => {
    expect(routeFrom({ method: 'DELETE', path: '/users/:id' }, { id: 'u1' })).toEqual({ method: 'DELETE', path: '/users/u1' })
  })
})

describe('apiUrl', () => {
  it('prefixes the route path with the API mount path', () => {
    expect(apiUrl({ method: 'GET', path: '/users' })).toBe('/api/users')
  })
})

describe('capabilityResolver', () => {
  it('resolves a preset pipeline capability', () => {
    const resolver = capabilityResolver(schema)
    expect(resolver.has('deleteUser')).toBe(true)
    expect(resolver.route('deleteUser', { id: 'u1' })).toEqual({ method: 'DELETE', path: '/users/u1' })
  })

  it('resolves a consumer pipeline by name', () => {
    const resolver = capabilityResolver(schema)
    expect(resolver.has('publishNewsletter')).toBe(true)
    expect(resolver.route('publishNewsletter')).toEqual({ method: 'POST', path: '/newsletter/publish' })
  })

  it('throws MissingCapabilityError for a pipeline the schema does not carry', () => {
    const resolver = capabilityResolver(schema)
    expect(resolver.has('replicationStatus')).toBe(false)
    expect(() => resolver.route('replicationStatus')).toThrow(MissingCapabilityError)
    expect(() => resolver.route('replicationStatus')).toThrow('capability "replicationStatus" is not available to this caller')
  })

  it('resolves a collection verb route', () => {
    const resolver = capabilityResolver(schema)
    expect(resolver.hasVerb('pages', 'update')).toBe(true)
    expect(resolver.verbRoute('pages', 'update', { id: 'p1' })).toEqual({ method: 'PATCH', path: '/pages/p1' })
  })

  it('throws MissingCapabilityError for a collection verb the schema does not carry', () => {
    const resolver = capabilityResolver(schema)
    expect(resolver.hasVerb('pages', 'delete')).toBe(false)
    expect(() => resolver.verbRoute('pages', 'delete', { id: 'p1' })).toThrow(MissingCapabilityError)
    expect(() => resolver.verbRoute('pages', 'delete', { id: 'p1' })).toThrow('collection "pages" has no capability "delete" for this caller')
  })

  it('resolves nothing when there is no schema yet', () => {
    const resolver = capabilityResolver(null)
    expect(resolver.has('deleteUser')).toBe(false)
    expect(resolver.hasVerb('pages', 'update')).toBe(false)
  })
})
