export const DEFAULT_LAYOUT = "default";

export function resolvePageLayout(stored: string | null | undefined): string {
  const name = typeof stored === "string" ? stored.trim() : "";
  return name || DEFAULT_LAYOUT;
}
