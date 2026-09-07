
export function isNavItemActive(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`)
}
