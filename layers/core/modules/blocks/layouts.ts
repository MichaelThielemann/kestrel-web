export const ADMIN_LAYOUT = "admin";

export interface ResolvedLayout {
  name: string;
  file: string;
}

export function offerableLayouts(layouts: Record<string, ResolvedLayout | undefined>): string[] {
  return Object.values(layouts)
    .filter((l): l is ResolvedLayout => !!l && typeof l.file === "string" && l.file.endsWith(".vue"))
    .map((l) => l.name)
    .filter((name) => name !== ADMIN_LAYOUT)
    .sort();
}

export function renderLayoutRegistry(names: string[]): string {
  return `export const kestrelLayouts = ${JSON.stringify(names)}\n`;
}
