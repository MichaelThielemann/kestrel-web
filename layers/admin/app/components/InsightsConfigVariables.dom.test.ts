import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import InsightsConfigVariables from './InsightsConfigVariables.vue'

const source = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/InsightsConfigVariables.vue'), 'utf-8')

const variables: InsightsConfigVariable[] = [
  { path: 'set.explicit', type: 'string', required: true, secret: false, set: true, status: 'set' },
  { path: 'default.explicit', type: 'string', required: true, default: 'inherited', secret: false, set: false, status: 'default' },
  { path: 'missing.required', type: 'string', required: true, secret: false, set: false, status: 'missing' },
  { path: 'missing.optional', type: 'string', required: false, secret: false, set: false, status: 'missing' },
  { path: 'set.fallback', type: 'string', required: true, secret: false, set: true },
  { path: 'missing.fallback', type: 'string', required: true, secret: false, set: false },
]

describe('InsightsConfigVariables', () => {
  it('renders set, default and missing status rows, including the pre-status fallback', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(variables.length)

    const dot = (row: (typeof rows)[number]) => row.get('.insights-config__dot')

    expect(dot(rows[0]!).classes()).toContain('insights-config__dot--set')
    expect(rows[0]!.text()).toContain(en['insights.set'])

    expect(dot(rows[1]!).classes()).toContain('insights-config__dot--default')
    expect(rows[1]!.text()).toContain(en['insights.default'])
    expect(dot(rows[1]!).attributes('title')).toBe(en['insights.defaultHint'])
    expect(dot(rows[1]!).attributes('aria-hidden')).toBe('true')

    expect(dot(rows[2]!).classes()).toContain('insights-config__dot--danger')
    expect(rows[2]!.text()).toContain(en['insights.notSet'])

    expect(dot(rows[3]!).classes()).toContain('insights-config__dot--muted')
    expect(rows[3]!.text()).toContain(en['insights.notSet'])

    expect(dot(rows[4]!).classes()).toContain('insights-config__dot--set')
    expect(rows[4]!.text()).toContain(en['insights.set'])

    expect(dot(rows[5]!).classes()).toContain('insights-config__dot--danger')
    expect(rows[5]!.text()).toContain(en['insights.notSet'])
  })

  it('shows the effective value and keeps a redacted one hidden', async () => {
    const withValues: InsightsConfigVariable[] = [
      { path: 'root', type: 'string', required: true, secret: false, set: true, status: 'set', value: '/var/lib/kestrel', default: '/tmp', redacted: false },
      { path: 'sessionSecret', type: 'string', required: true, secret: true, set: true, status: 'set', value: null, redacted: true },
    ]
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables: withValues } })

    const cells = wrapper.findAll('tbody tr')[0]!.findAll('td')
    expect(cells[3]!.text()).toBe('"/var/lib/kestrel"')
    expect(cells[4]!.text()).toBe('"/tmp"')

    const secretRow = wrapper.findAll('tbody tr')[1]!
    expect(secretRow.findAll('td')[3]!.text()).toBe(en['insights.redacted'])
    expect(secretRow.text()).not.toContain('hunter')
  })

  it('names the table after the given heading', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables, labelledBy: 'heading-id', scroll: false } })

    expect(wrapper.get('table').attributes('aria-labelledby')).toBe('heading-id')
  })

  it('lets its columns size to their content instead of forcing a fixed layout that collapses at phone width', () => {
    expect(source).not.toMatch(/\.insights-table\s*{[^}]*table-layout:\s*fixed/)
  })

  it('scrolls the table horizontally rather than shrinking it, like every other admin table', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables } })
    const scrollAncestor = wrapper.get('table').element.closest('.u-scroll')
    expect(scrollAncestor).not.toBeNull()
  })

  it('keeps path, type, required and status on one line each, so the status dot never wraps away from its label', () => {
    const nowrapBlock = source.match(/&__path,[\s\S]*?{\s*white-space:\s*nowrap;\s*}/)
    expect(nowrapBlock).not.toBeNull()
    expect(nowrapBlock![0]).toMatch(/&__nowrap\s*[,{]/)
    expect(nowrapBlock![0]).toMatch(/&__status\s*[,{]/)
  })

  it('renders the status dot and its label inside the same cell, never split across a line break', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables } })
    const statusCell = wrapper.findAll('tbody tr')[0]!.get('.insights-config__status')
    const dot = statusCell.get('.insights-config__dot')
    expect(dot.element.parentElement).toBe(statusCell.element)
  })

  it('bounds a wrapping value (object, array, record) to a fixed character width and lets it wrap inside it, instead of forcing the table wider', () => {
    const valueBlock = source.match(/&__value--wrap\s*{[\s\S]*?\.insights-value__text\s*{([^}]*)}/)
    expect(valueBlock).not.toBeNull()
    const declarations = valueBlock![1]!
    expect(declarations).toMatch(/max-width:\s*40ch/)
    expect(declarations).toMatch(/overflow-wrap:\s*anywhere/)
    expect(declarations).not.toMatch(/white-space:\s*nowrap/)
  })

  it('keeps a short scalar value (number, boolean, enum) on one line instead of breaking it apart', async () => {
    const scalar: InsightsConfigVariable[] = [
      { path: 'busyTimeoutMs', type: 'integer', required: false, secret: false, set: true, status: 'set', value: 20000 },
    ]
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables: scalar } })
    const valueCell = wrapper.findAll('tbody tr')[0]!.findAll('td')[3]!
    expect(valueCell.classes()).not.toContain('insights-config__value--wrap')
  })

  it('gives the embedded (non-sticky) table its own horizontal scroll region, separate from the page vertical scroll', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables, labelledBy: 'heading-id', scroll: false } })
    const region = wrapper.get('table').element.closest('[role="region"]')
    expect(region).not.toBeNull()
    expect(region?.getAttribute('tabindex')).toBe('0')
    expect(region?.getAttribute('aria-labelledby')).toBe('heading-id')
    expect(region?.closest('.u-scroll')).toBeNull()
  })

  it('falls back to a generic label on the scroll region when no heading is given to label it', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables, scroll: false } })
    const region = wrapper.get('table').element.closest('[role="region"]')
    expect(region?.getAttribute('aria-label')).toBe(en['insights.configScrollRegion'])
  })

  it('names the source of a value a preset supplied, in the same blue dot as any other default', async () => {
    const fromPreset: InsightsConfigVariable[] = [
      { path: 'dependencies.render', type: 'enum', required: false, secret: false, set: false, status: 'default', source: 'preset', default: 'background' },
    ]
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables: fromPreset } })
    const row = wrapper.findAll('tbody tr')[0]!
    const dot = row.get('.insights-config__dot')

    expect(dot.classes()).toContain('insights-config__dot--default')
    expect(row.text()).toContain('Default · Preset')
    expect(dot.attributes('title')).toBe('Value the Preset supplies')
  })
})
