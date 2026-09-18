import type { FieldDef } from '#kestrel-admin/types/kestrel'

type NumberOptions = Extract<FieldDef, { type: 'number' }>['options']
type ChoiceOptions = Extract<FieldDef, { type: 'choice' }>['options']

export function numberIsInteger(options: NumberOptions): boolean {
  return options?.integer !== false && options?.decimals === undefined
}

export function choiceValues(options: ChoiceOptions): [string, ...string[]] {
  const [first, ...rest] = options.choices.map((c) => c.value)
  if (first === undefined) throw new Error('choiceValues: options.choices must not be empty')
  return [first, ...rest]
}
