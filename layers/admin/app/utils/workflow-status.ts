import type { Localized, SerializedCollection } from '#kestrel-admin/types/kestrel'
import { resolveLocalized } from './localized'

export interface StatusChoice { value: string; label: Localized }

type WorkflowCollection = Pick<SerializedCollection, 'workflow' | 'fields'>

function isLocalized(value: unknown): value is Localized {
  return typeof value === 'string' || (typeof value === 'object' && value !== null && !Array.isArray(value))
}

function isStatusChoice(value: unknown): value is StatusChoice {
  return typeof value === 'object' && value !== null && 'value' in value && 'label' in value
    && typeof value.value === 'string' && isLocalized(value.label)
}

/** The choices of the workflow status field, empty when the collection has no workflow. */
export function statusChoices(collection: WorkflowCollection): StatusChoice[] {
  const field = collection.workflow ? collection.fields[collection.workflow.field] : undefined
  const raw = field?.options?.choices
  return Array.isArray(raw) ? raw.filter(isStatusChoice) : []
}

/** The label of a status value in the admin language; the raw value when no choice carries it. */
export function statusLabel(choices: readonly StatusChoice[], value: string, lang: string): string {
  const choice = choices.find((c) => c.value === value)
  return (choice && resolveLocalized(choice.label, lang)) ?? value
}

/**
 * The status name to show next to a record that is not live, or `undefined` for a live record and for
 * collections without a workflow. A record without a status counts as a draft.
 */
export function statusHint(collection: WorkflowCollection, doc: Record<string, unknown>, lang: string): string | undefined {
  const workflow = collection.workflow
  if (!workflow) return undefined
  const raw = doc[workflow.field]
  const value = typeof raw === 'string' && raw !== '' ? raw : workflow.draft
  return value === workflow.live ? undefined : statusLabel(statusChoices(collection), value, lang)
}
