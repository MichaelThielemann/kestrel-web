import { ref, type Ref } from 'vue'
import { apiErrorCode } from './useApi'

export const REAUTH_REQUIRED = 'REAUTH_REQUIRED'

export interface ReauthQueue {
  open: Ref<boolean>
  isOpen: () => boolean
  request: () => Promise<boolean>
  settle: (confirmed: boolean) => void
}

export function createReauthQueue(): ReauthQueue {
  const open = ref(false)
  const waiting: Array<(confirmed: boolean) => void> = []
  return {
    open,
    isOpen: () => open.value,
    request: () => new Promise<boolean>((resolve) => {
      waiting.push(resolve)
      open.value = true
    }),
    settle(confirmed) {
      open.value = false
      for (const resolve of waiting.splice(0)) resolve(confirmed)
    },
  }
}

export async function retryAfterReauth<T>(call: () => Promise<T>, confirm: () => Promise<boolean>): Promise<T> {
  try {
    return await call()
  } catch (e) {
    if (apiErrorCode(e) !== REAUTH_REQUIRED || !(await confirm())) throw e
    return call()
  }
}

const queue = createReauthQueue()

export function useReauth(): ReauthQueue {
  return queue
}
