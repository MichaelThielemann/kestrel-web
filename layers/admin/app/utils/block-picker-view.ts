export const BLOCK_PICKER_VIEW_KEY = 'kestrel.blockPicker.view'

export const BLOCK_PICKER_VIEWS = ['grid', 'large', 'list'] as const

export type BlockPickerView = (typeof BLOCK_PICKER_VIEWS)[number]

function isBlockPickerView(value: unknown): value is BlockPickerView {
  return BLOCK_PICKER_VIEWS.some((v) => v === value)
}

export function parseBlockPickerView(value: unknown): BlockPickerView {
  return isBlockPickerView(value) ? value : 'grid'
}
