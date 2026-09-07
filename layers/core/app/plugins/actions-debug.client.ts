import { setActionDebug } from '../utils/actions'

export default defineNuxtPlugin(() => {
  setActionDebug(useRuntimeConfig().public.kestrelDebugActions)
})
