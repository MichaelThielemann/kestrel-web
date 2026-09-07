const REQUIRED = 'This field is required.'

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^must have required property '[^']+'$/, () => REQUIRED],
  [/^must be (?:object|string|number|integer|boolean|array)$/, () => REQUIRED],
  [/^must NOT have fewer than (\d+) items$/, (m) => `Add at least ${m[1]} item(s).`],
  [/^must NOT have more than (\d+) items$/, (m) => `Use at most ${m[1]} item(s).`],
  [/^must NOT have fewer than (\d+) characters$/, (m) => `Enter at least ${m[1]} characters.`],
  [/^must NOT have more than (\d+) characters$/, (m) => `Enter at most ${m[1]} characters.`],
  [/^must be >= (-?[\d.]+)$/, (m) => `Enter a value of at least ${m[1]}.`],
  [/^must be <= (-?[\d.]+)$/, (m) => `Enter a value of at most ${m[1]}.`],
  [/^must match pattern/, () => 'Invalid format.'],
  [/^must match format/, () => 'Invalid format.'],
  [/^must be equal to one of the allowed values$/, () => 'Choose one of the allowed values.'],
  [/^must be null$/, () => 'Unexpected value.'],
]

export function humanizeSchemaMessage(message: string): string {
  for (const [pattern, render] of RULES) {
    const m = pattern.exec(message)
    if (m) return render(m)
  }
  return message
}

export function humanizeSchemaProblem(segments: string[], message: string): { segments: string[]; message: string } {
  const required = /^must have required property '([^']+)'$/.exec(message)
  if (required) return { segments: [...segments, required[1]!], message: REQUIRED }
  return { segments, message: humanizeSchemaMessage(message) }
}
