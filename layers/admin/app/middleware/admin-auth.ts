export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  if (!(await auth.ensureSession())) return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`)
  await useSchema().load()
})
