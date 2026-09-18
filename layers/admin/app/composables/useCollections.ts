import { collections } from '#kestrel-admin/utils/collections'

export function useCollections() {
  const { schema } = useSchema()
  const list = computed(() => collections(schema.value))
  return { collections: list, load: () => list.value }
}
