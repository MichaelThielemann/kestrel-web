const DEFAULT_LAYOUT_NAME = "default";

export interface LayoutSelectOption {
  label: string;
  value: string;
}

export function layoutSelectOptions(names: string[], fallbackLabel: string): LayoutSelectOption[] {
  return [
    { label: fallbackLabel, value: "" },
    ...names.filter((n) => n !== DEFAULT_LAYOUT_NAME).map((n) => ({ label: n, value: n })),
  ];
}
