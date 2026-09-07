
export function safeRedirect(target: unknown): string | null {
  if (typeof target !== 'string') return null
  if (target.startsWith('//')) return null
  const local = target === '/admin' || target.startsWith('/admin/') || target.startsWith('/admin?')
  if (!local) return null
  if (target === '/admin/login' || target.startsWith('/admin/login?') || target.startsWith('/admin/login/')) return null
  return target
}
