import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useEchoGuard } from './useEchoGuard'
import type { LinkValue, LinkType } from '#kestrel-admin/types/kestrel'

export function hasExtras(value: LinkValue | null | undefined): boolean {
  return !!(value?.label || (value?.type === 'internal' && value.hash))
}

export function useLinkField(
  model: Ref<LinkValue | null | undefined>,
  allowed: Ref<LinkType[]>,
) {
  const initial = model.value

  const currentType = ref<LinkType>(
    initial?.type ?? allowed.value[0] ?? 'external',
  )
  const label = ref(initial?.label ?? '')
  const url = ref(initial?.type === 'external' ? initial.url : '')
  const email = ref(initial?.type === 'email' ? initial.email : '')
  const tel = ref(initial?.type === 'tel' ? initial.tel : '')
  const collection = ref<string | null>(initial?.type === 'internal' ? initial.collection : null)
  const recordId = ref<string | null>(initial?.type === 'internal' ? initial.id : null)
  const hash = ref(initial?.type === 'internal' ? (initial.hash ?? '') : '')

  function build(): LinkValue | null {
    const lbl = label.value.trim() || undefined
    const type = currentType.value
    if (type === 'external') {
      const u = url.value.trim()
      return u ? { type: 'external', url: u, ...(lbl ? { label: lbl } : {}) } : null
    }
    if (type === 'email') {
      const e = email.value.trim()
      return e ? { type: 'email', email: e, ...(lbl ? { label: lbl } : {}) } : null
    }
    if (type === 'tel') {
      const t = tel.value.trim()
      return t ? { type: 'tel', tel: t, ...(lbl ? { label: lbl } : {}) } : null
    }
    if (collection.value && recordId.value) {
      const h = hash.value.trim().replace(/^#+/, '')
      return { type: 'internal', collection: collection.value, id: recordId.value, ...(h ? { hash: h } : {}), ...(lbl ? { label: lbl } : {}) }
    }
    return null
  }

  function reseed(m: LinkValue | null | undefined) {
    const v = m ?? null
    if (v) currentType.value = v.type
    label.value = v?.label ?? ''
    url.value = v?.type === 'external' ? v.url : ''
    email.value = v?.type === 'email' ? v.email : ''
    tel.value = v?.type === 'tel' ? v.tel : ''
    collection.value = v?.type === 'internal' ? v.collection : null
    recordId.value = v?.type === 'internal' ? v.id : null
    hash.value = v?.type === 'internal' ? (v.hash ?? '') : ''
  }

  watch([currentType, label, url, email, tel, collection, recordId, hash], () => { model.value = build() })

  useEchoGuard(model, () => build(), reseed)

  const typeModel = computed<LinkType>({
    get: () => currentType.value,
    set: (v) => { if (v) currentType.value = v as LinkType },
  })

  return { currentType, label, url, email, tel, collection, recordId, hash, typeModel }
}
