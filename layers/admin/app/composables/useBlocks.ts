import { blockDefinitions } from '#kestrel/blocks'
import { blockImages } from '#kestrel/block-images'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'

export const blocksWithImages: SerializedBlock[] = blockDefinitions.map((block) =>
  blockImages[block.name] ? { ...block, image: blockImages[block.name] } : block,
)

export function useBlocks() {
  return { blocks: computed(() => blocksWithImages), load: async () => blocksWithImages }
}
