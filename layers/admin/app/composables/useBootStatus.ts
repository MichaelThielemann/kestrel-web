export function useBootStatus() {
  const failed = useState<boolean>('kestrel-boot-failed', () => false)
  const error = useState<string | null>('kestrel-boot-error', () => null)
  const checked = useState<boolean>('kestrel-boot-checked', () => false)

  onMounted(async () => {
    if (checked.value) return
    checked.value = true
    const api = useApi()
    try {
      await api('/ready')
    } catch (e) {
      if (apiErrorCode(e) === 'failed') {
        failed.value = true
        error.value = apiErrorMessage(e)
      }
    }
  })

  return { failed, error }
}
