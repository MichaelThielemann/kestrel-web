import { describe, expect, it } from 'vitest'
import manifest from './__fixtures__/insights-manifest.json'
import stats from './__fixtures__/insights-stats.json'
import type { InsightsConfigVariable, InsightsManifest, InsightsModule, InsightsStats } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import {
  configDefaultText,
  configValueText,
  configVariableMatches,
  effectiveConfigStatus,
  formatMs,
  formatUptime,
  isConfigRedacted,
  moduleConfigSummary,
  moduleRoute,
  pipelineStatsByName,
  pipelinesUsingModule,
  sortedModules,
  stepsOfModule,
  triggersOf,
} from './insights-format'

function variable(patch: Partial<InsightsConfigVariable> = {}): InsightsConfigVariable {
  return { path: 'a.b', type: 'string', required: false, secret: false, set: true, ...patch }
}

const typedManifest = boundaryCast<InsightsManifest>(manifest, 'json')
const typedStats = boundaryCast<InsightsStats>(stats, 'json')

describe('formatMs', () => {
  it('formats zero', () => expect(formatMs(0)).toBe('0 ms'))
  it('formats sub-second', () => expect(formatMs(42)).toBe('42 ms'))
  it('formats seconds above 1000', () => expect(formatMs(1200)).toBe('1.2 s'))
  it('formats minutes above 60000', () => expect(formatMs(65000)).toBe('1:05 min'))
})

describe('formatUptime', () => {
  it('formats days and hours', () => expect(formatUptime((2 * 24 * 60 + 3 * 60) * 60000, 'en')).toBe('2 d 3 h'))
  it('formats hours and minutes', () => expect(formatUptime((3 * 60 + 5) * 60000, 'en')).toBe('3 h 5 min'))
  it('formats minutes only', () => expect(formatUptime(5 * 60000, 'en')).toBe('5 min'))
  it('formats with German unit labels', () => expect(formatUptime((2 * 24 * 60 + 3 * 60) * 60000, 'de')).toBe('2 T 3 Std'))
  it('falls back to English units for an unknown language', () => expect(formatUptime(5 * 60000, 'fr')).toBe('5 min'))
})

describe('effectiveConfigStatus', () => {
  const base: InsightsConfigVariable = { path: 'a', type: 'string', required: true, secret: false, set: false }

  it('trusts an explicit status from a 5.5+ backend', () => {
    expect(effectiveConfigStatus({ ...base, status: 'set' })).toBe('set')
    expect(effectiveConfigStatus({ ...base, status: 'default' })).toBe('default')
    expect(effectiveConfigStatus({ ...base, status: 'missing' })).toBe('missing')
  })

  it('falls back to the boolean set from a pre-status 5.3/5.4 backend', () => {
    expect(effectiveConfigStatus({ ...base, set: true })).toBe('set')
    expect(effectiveConfigStatus({ ...base, set: false })).toBe('missing')
  })
})

describe('moduleConfigSummary', () => {
  it('counts set variables and lists missing required ones', () => {
    const m = typedManifest.modules.find((mod) => mod.name === 'blobstore/filesystem')
    if (!m) throw new Error('fixture missing blobstore/filesystem module')
    expect(moduleConfigSummary(m)).toEqual({ set: 1, total: 1, missingRequired: [] })
  })

  it('reports missing required variables (pre-status backend)', () => {
    const missing: InsightsModule = {
      name: 'x', use: 'x', version: null, provides: [], requires: [], optional: [],
      config: { schema: {}, variables: [{ path: 'a', type: 'string', required: true, secret: false, set: false }] },
      steps: [], eventHook: false,
    }
    expect(moduleConfigSummary(missing)).toEqual({ set: 0, total: 1, missingRequired: ['a'] })
  })

  it('does not flag a required variable using its schema default as missing', () => {
    const usingDefault: InsightsModule = {
      name: 'x', use: 'x', version: null, provides: [], requires: [], optional: [],
      config: { schema: {}, variables: [{ path: 'a', type: 'string', required: true, default: 'inherited', secret: false, set: false, status: 'default' }] },
      steps: [], eventHook: false,
    }
    expect(moduleConfigSummary(usingDefault)).toEqual({ set: 0, total: 1, missingRequired: [] })
  })

  it('trusts an explicit missing status over a stale true set flag', () => {
    const staleSet: InsightsModule = {
      name: 'x', use: 'x', version: null, provides: [], requires: [], optional: [],
      config: { schema: {}, variables: [{ path: 'a', type: 'string', required: true, secret: false, set: true, status: 'missing' }] },
      steps: [], eventHook: false,
    }
    expect(moduleConfigSummary(staleSet).missingRequired).toEqual(['a'])
  })
})

describe('pipelinesUsingModule', () => {
  it('finds pipelines that use a module step', () => {
    const result = pipelinesUsingModule(typedManifest, 'authn/multi')
    expect(result.map((p) => p.name)).toContain('login')
  })

  it('returns empty for an unused module', () => {
    expect(pipelinesUsingModule(typedManifest, 'does/not-exist')).toEqual([])
  })
})

describe('triggersOf', () => {
  it('collects http, event and cron triggers for a pipeline', () => {
    expect(triggersOf(typedManifest, 'login')).toEqual([{ kind: 'http', label: 'POST /login' }])
  })

  it('labels an http trigger with method and path', () => {
    expect(triggersOf(typedManifest, 'listPages')).toEqual([{ kind: 'http', label: 'GET /admin/pages' }])
  })

  it('labels an event trigger with the event name', () => {
    expect(triggersOf(typedManifest, 'auditAuth')).toEqual([{ kind: 'event', label: 'auth.loggedIn' }])
  })

  it('labels a cron trigger with the expression', () => {
    expect(triggersOf(typedManifest, 'sweepRateLimits')).toEqual([{ kind: 'cron', label: '*/15 * * * *' }])
  })

  it('returns empty when a pipeline has no trigger', () => {
    expect(triggersOf(typedManifest, 'unknownPipeline')).toEqual([])
  })
})

describe('stepsOfModule', () => {
  it('filters manifest steps by module', () => {
    const steps = stepsOfModule(typedManifest, 'authn/multi')
    expect(steps.map((s) => s.name).sort()).toEqual(['authn.login', 'authn.logout', 'authn.me', 'authn.requireUser'].sort())
  })
})

describe('pipelineStatsByName', () => {
  it('indexes stats by pipeline name', () => {
    const map = pipelineStatsByName(typedStats)
    expect(map.get('login')?.count).toBe(20)
  })

  it('returns an empty map for null stats', () => {
    expect(pipelineStatsByName(null).size).toBe(0)
  })
})

describe('sortedModules', () => {
  it('sorts modules by name', () => {
    const names = sortedModules(typedManifest).map((m) => m.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe('moduleRoute', () => {
  it('builds the catch-all route for a slashed module name', () => {
    expect(moduleRoute('blobstore/filesystem')).toBe('/admin/insights/modules/blobstore/filesystem')
  })

  it('encodes a segment containing a space', () => {
    expect(moduleRoute('my module/sub name')).toBe('/admin/insights/modules/my%20module/sub%20name')
  })
})

describe('isConfigRedacted', () => {
  it('is true for a schema secret and for a backend-flagged redaction', () => {
    expect(isConfigRedacted(variable({ secret: true }))).toBe(true)
    expect(isConfigRedacted(variable({ redacted: true }))).toBe(true)
  })

  it('is false for a plain variable', () => {
    expect(isConfigRedacted(variable())).toBe(false)
  })
})

describe('configValueText', () => {
  it('serialises the effective value', () => {
    expect(configValueText(variable({ value: 'hello' }))).toBe('"hello"')
    expect(configValueText(variable({ value: 30000 }))).toBe('30000')
    expect(configValueText(variable({ value: { a: [1, 2] } }))).toBe('{"a":[1,2]}')
  })

  it('never returns a value for a redacted variable', () => {
    expect(configValueText(variable({ secret: true, value: 'leaked' }))).toBeNull()
    expect(configValueText(variable({ redacted: true, value: 'leaked' }))).toBeNull()
  })

  it('returns null when the backend sends no value at all', () => {
    expect(configValueText(variable())).toBeNull()
    expect(configValueText(variable({ value: null }))).toBeNull()
  })
})

describe('configDefaultText', () => {
  it('serialises the default and hides it for a redacted variable', () => {
    expect(configDefaultText(variable({ default: 'inherited' }))).toBe('"inherited"')
    expect(configDefaultText(variable({ secret: true, default: 'inherited' }))).toBeNull()
    expect(configDefaultText(variable())).toBeNull()
  })
})

describe('configVariableMatches', () => {
  const v = variable({ path: 'blobstore.root', value: '/var/lib/kestrel' })

  it('keeps everything when the query is blank', () => {
    expect(configVariableMatches(v, 'blobstore/filesystem', '  ')).toBe(true)
  })

  it('matches the module name, the path and the value', () => {
    expect(configVariableMatches(v, 'blobstore/filesystem', 'FILESYSTEM')).toBe(true)
    expect(configVariableMatches(v, 'blobstore/filesystem', 'root')).toBe(true)
    expect(configVariableMatches(v, 'blobstore/filesystem', 'var/lib')).toBe(true)
  })

  it('does not match a redacted value', () => {
    const secret = variable({ path: 'auth.token', secret: true, value: 'hunter2' })
    expect(configVariableMatches(secret, 'authn/multi', 'hunter2')).toBe(false)
    expect(configVariableMatches(v, 'blobstore/filesystem', 'nothing')).toBe(false)
  })
})
