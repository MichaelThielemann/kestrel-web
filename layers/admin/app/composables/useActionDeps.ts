import type { ActionDeps } from '../actions/types'
import { useAdminApi } from './useAdminApi'
import { useCapabilities } from './useCapabilities'
import { useT } from './useT'
import { useToast } from './useToast'

export function useActionDeps(): ActionDeps {
  const { t } = useT()
  return { api: useAdminApi(), t, toast: useToast(), capabilities: useCapabilities() }
}
