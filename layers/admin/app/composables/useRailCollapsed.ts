
export function useRailCollapsed() {
  const collapsed = useCookie<boolean>('kestrel-rail-collapsed', { default: () => false })

  function toggle() {
    collapsed.value = !collapsed.value
  }

  return { collapsed, toggle }
}
