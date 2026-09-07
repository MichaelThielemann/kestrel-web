export const BLOCK_PICKER_VIEW_KEY = 'kestrel.blockPicker.view'

export const BLOCK_PICKER_VIEWS = ['grid', 'large', 'list'] as const

export type BlockPickerView = (typeof BLOCK_PICKER_VIEWS)[number]

export function parseBlockPickerView(value: unknown): BlockPickerView {
  return (BLOCK_PICKER_VIEWS as readonly unknown[]).includes(value) ? (value as BlockPickerView) : 'grid'
}
