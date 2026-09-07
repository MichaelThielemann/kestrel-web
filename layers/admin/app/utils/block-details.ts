import { resolveLocalized } from './localized'
import type { SerializedBlock } from '#kestrel/types/kestrel'

export interface BlockDetailField {
  key: string
  label: string
  type: string
  required: boolean
}

export interface BlockDetailImageSize {
  name: string
  width: number
  height?: number
}

export interface BlockDetails {
  description?: string
  slots: string[]
  fields: BlockDetailField[]
  imageSizes: BlockDetailImageSize[]
  source?: string
}

export function blockDetails(block: SerializedBlock, lang: string): BlockDetails {
  return {
    description: resolveLocalized(block.description, lang),
    slots: block.slots ?? [],
    fields: Object.entries(block.fields).map(([key, field]) => ({
      key,
      label: resolveLocalized(field.label, lang) ?? key,
      type: field.type,
      required: field.required,
    })),
    imageSizes: (block.imageSizes ?? []).map((size) => (
      size.height !== undefined ? { name: size.name, width: size.width, height: size.height } : { name: size.name, width: size.width }
    )),
    source: block.source,
  }
}
