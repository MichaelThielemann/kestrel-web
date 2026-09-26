import { ref } from 'vue'
import type { DeliveryEntry, PublishStatusEntry } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'

export interface UseEditFormDeliveryOptions {
  deps: ActionDeps
  collection: string
  id: string
}

export function useEditFormDelivery(opts: UseEditFormDeliveryOptions) {
  const { deps, collection, id } = opts
  const { api, capabilities } = deps

  const delivery = ref<DeliveryEntry[] | null>(null)
  const deliveryLoading = ref(false)

  async function loadDelivery() {
    if (id === 'new' || !capabilities.hasVerb(collection, 'publishStatus')) return
    deliveryLoading.value = true
    try {
      delivery.value = await api<PublishStatusEntry[]>(capabilities.verbRoute(collection, 'publishStatus', { id }))
    } catch {
      delivery.value = null
    } finally {
      deliveryLoading.value = false
    }
  }

  return { delivery, deliveryLoading, loadDelivery }
}
