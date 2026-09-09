import type { FieldDef } from '#kestrel-admin/types/kestrel'

type NumberOptions = Extract<FieldDef, { type: 'number' }>['options']
type ChoiceOptions = Extract<FieldDef, { type: 'choice' }>['options']

export function numberIsInteger(options: NumberOptions): boolean {
  return options?.integer !== false && options?.decimals === undefined
}

export function choiceValues(options: ChoiceOptions): [string, ...string[]] {
  return options.choices.map((c) => c.value) as [string, ...string[]]
}
