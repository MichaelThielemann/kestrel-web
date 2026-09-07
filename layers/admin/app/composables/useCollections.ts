import { collections } from '#kestrel/utils/collections'

export function useCollections() {
  return { collections: computed(() => collections), load: async () => collections }
}
