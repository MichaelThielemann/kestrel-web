import { ref } from 'vue'
import type { AutoRedirect } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'
import { toastFailure } from '../actions/steps/notify'
import { apiErrorMessage, toApiError } from './useApi'

/** The automatic redirects `redirects-default` keeps for moved documents, and removing one of them. */
export function useAutoRedirects(deps: ActionDeps) {
  const items = ref<AutoRedirect[]>([])
  const loading = ref(false)
  const error = ref('')
  const removing = ref<string | null>(null)

  async function load(): Promise<void> {
    if (!deps.capabilities.has('listAutoRedirects')) return
    loading.value = true
    error.value = ''
    try {
      items.value = await deps.api<AutoRedirect[]>(deps.capabilities.route('listAutoRedirects'))
    } catch (e) {
      error.value = apiErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function remove(from: string): Promise<void> {
    if (removing.value !== null) return
    removing.value = from
    try {
      await deps.api(deps.capabilities.route('removeAutoRedirect', { path: from.replace(/^\/+/, '') }))
      deps.toast.success(deps.t('redirects.auto.removed', { from }))
      await load()
    } catch (e) {
      const err = toApiError(e)
      toastFailure(deps, err.message, err)
    } finally {
      removing.value = null
    }
  }

  return { items, loading, error, removing, load, remove }
}
