import { collections } from '#kestrel-admin/utils/collections'

export function useCollections() {
  return { collections: computed(() => collections), load: async () => collections }
}
