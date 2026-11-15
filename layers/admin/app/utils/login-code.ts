/** A second-factor code without the blanks and hyphens authenticator apps and recovery-code lists group it with. */
export function compactCode(input: string): string {
  return input.replace(/[\s-]/g, '')
}
