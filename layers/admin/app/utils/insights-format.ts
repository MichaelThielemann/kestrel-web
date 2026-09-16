import type { InsightsManifest, InsightsModule, InsightsPipeline, InsightsPipelineStats, InsightsStats, InsightsStep } from '#kestrel-admin/types/api'

export function formatMs(ms: number): string {
  if (ms <= 0) return '0 ms'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')} min`
}

const UPTIME_UNIT_LABEL: Record<'day' | 'hour' | 'minute', Record<string, string>> = {
  day: { en: 'd', de: 'T' },
  hour: { en: 'h', de: 'Std' },
  minute: { en: 'min', de: 'min' },
}

function formatUnit(lang: string, value: number, unit: 'day' | 'hour' | 'minute'): string {
  const short = UPTIME_UNIT_LABEL[unit][lang] ?? UPTIME_UNIT_LABEL[unit].en
  return `${value} ${short}`
}

export function formatUptime(ms: number, lang: string): string {
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${formatUnit(lang, days, 'day')} ${formatUnit(lang, hours, 'hour')}`
  if (hours > 0) return `${formatUnit(lang, hours, 'hour')} ${formatUnit(lang, minutes, 'minute')}`
  return formatUnit(lang, minutes, 'minute')
}

export function moduleConfigSummary(m: InsightsModule): { set: number; total: number; missingRequired: string[] } {
  const variables = m.config.variables
  const set = variables.filter((v) => v.set).length
  const missingRequired = variables.filter((v) => v.required && !v.set).map((v) => v.path)
  return { set, total: variables.length, missingRequired }
}

export function pipelinesUsingModule(manifest: InsightsManifest, moduleName: string): InsightsPipeline[] {
  return manifest.pipelines.filter((p) => p.steps.some((s) => s.module === moduleName))
}

export interface InsightsTriggerRef { kind: 'http' | 'event' | 'cron'; label: string }

export function triggersOf(manifest: InsightsManifest, pipeline: string): InsightsTriggerRef[] {
  const http = manifest.triggers.http.filter((t) => t.pipeline === pipeline).map((t) => ({ kind: 'http' as const, label: `${t.method} ${t.path}` }))
  const events = manifest.triggers.events.filter((t) => t.pipeline === pipeline).map((t) => ({ kind: 'event' as const, label: t.event }))
  const crons = manifest.triggers.crons.filter((t) => t.pipeline === pipeline).map((t) => ({ kind: 'cron' as const, label: t.expression }))
  return [...http, ...events, ...crons]
}

export function stepsOfModule(manifest: InsightsManifest, moduleName: string): InsightsStep[] {
  return manifest.steps.filter((s) => s.module === moduleName)
}

export function pipelineStatsByName(stats: InsightsStats | null): Map<string, InsightsPipelineStats> {
  return new Map((stats?.pipelines ?? []).map((p) => [p.name, p]))
}

export function sortedModules(manifest: InsightsManifest): InsightsModule[] {
  return [...manifest.modules].sort((a, b) => a.name.localeCompare(b.name))
}

export function moduleRoute(name: string): string {
  return `/admin/insights/modules/${name.split('/').map(encodeURIComponent).join('/')}`
}
