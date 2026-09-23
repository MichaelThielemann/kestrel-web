export function useAdminBodyClass(): void {
  useHead(() => ({ bodyAttrs: { class: 'admin-body' } }))
}
