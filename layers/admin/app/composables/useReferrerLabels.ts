import { ref, watch, type Ref } from 'vue'
import type { ReferenceTo } from '#kestrel-admin/types/api'
import { findCollection } from '../utils/collections'
import { referrerKey, referrerLabel } from '../utils/referrer-label'

export function useReferrerLabels(refs: Ref<ReferenceTo[]>) {
  const api = useApi()
  const { schema } = useSchema()
  const labels = ref<Record<string, string>>({})

  watch(refs, async (list) => {
    const missing = list.filter((r) => !(referrerKey(r) in labels.value))
    await Promise.all(missing.map(async (r) => {
      const doc = await api<Record<string, unknown>>(`/admin/${r.type}/${r.id}`).catch(() => null)
      labels.value = { ...labels.value, [referrerKey(r)]: referrerLabel(r, doc, findCollection(schema.value, r.type)?.fields) }
    }))
  }, { immediate: true })

  const labelOf = (r: ReferenceTo) => labels.value[referrerKey(r)] ?? referrerKey(r)
  return { labelOf }
}
