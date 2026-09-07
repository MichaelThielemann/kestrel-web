
const fieldEmpties: Record<string, () => unknown> = {}

export function registerFieldEmpty(type: string, make: () => unknown): void {
  fieldEmpties[type] = make
}

export function resolveFieldEmpty(type: string): (() => unknown) | undefined {
  return fieldEmpties[type]
}
