export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  const loginPath = `/admin/login?redirect=${encodeURIComponent(to.fullPath)}`
  if (!(await auth.ensureSession())) return navigateTo(loginPath)
  if (await useSchema().load() === 'unauthenticated') {
    auth.reset()
    return navigateTo(loginPath)
  }
})
