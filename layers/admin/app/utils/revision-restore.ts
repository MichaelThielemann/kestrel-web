import type { ApiErrorDetails, RestoreReport } from '#kestrel-admin/types/api'
import { humanizeFieldName } from './humanize'

export function fieldNames(fields: readonly string[] | undefined, labels: Record<string, string>): string[] {
  return (fields ?? []).map((field) => labels[field] ?? humanizeFieldName(field))
}

export function hasRestoreGap(report: RestoreReport | undefined): boolean {
  return (report?.dropped.length ?? 0) > 0 || (report?.missing.length ?? 0) > 0
}

export function restoreProblems(details: ApiErrorDetails | undefined, labels: Record<string, string>): string[] {
  const lines: string[] = []
  for (const entry of details?.fields ?? []) {
    lines.push(`${labels[entry.field] ?? humanizeFieldName(entry.field)}: ${entry.message}`)
  }
  for (const problem of details?.problems ?? []) {
    lines.push(problem.path ? `${problem.path}: ${problem.message}` : problem.message)
  }
  for (const ref of details?.refs ?? []) {
    lines.push(`${labels[ref.field] ?? humanizeFieldName(ref.field)}: ${ref.to}/${ref.id}`)
  }
  return lines
}
