/** Marks `<body>` with `site-body` while the calling component is mounted and `enabled` holds, so the site stylesheet can reset the body margin and paint the body in the site's colours without touching the admin. */
export function useSiteBodyClass(enabled: () => boolean = () => true): void {
  useHead(() => (enabled() ? { bodyAttrs: { class: 'site-body' } } : {}))
}
