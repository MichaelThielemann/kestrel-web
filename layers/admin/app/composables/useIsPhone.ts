export const PHONE_BREAKPOINT_PX = 640

export function phoneMediaQuery(breakpointPx: number = PHONE_BREAKPOINT_PX): string {
  return `(max-width: ${breakpointPx}px)`
}

export function useIsPhone() {
  return useMediaQuery(phoneMediaQuery())
}
