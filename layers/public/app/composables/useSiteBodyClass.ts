/** Marks `<body>` with `site-body` while the site layout is mounted, so the site stylesheet can reset the body margin and background without touching the admin. */
export function useSiteBodyClass(): void {
  useHead(() => ({ bodyAttrs: { class: 'site-body' } }))
}
