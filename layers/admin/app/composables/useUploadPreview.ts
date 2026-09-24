import { ref } from 'vue'

const PREVIEW_WIDTH = 320

async function drawPreview(file: File): Promise<string | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: PREVIEW_WIDTH })
  } catch {
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    bitmap.close()
  }
}

export function useUploadPreview() {
  const previews = ref<Map<string, string>>(new Map())
  const releasedIds = new Set<string>()
  let disposed = false
  let chain: Promise<void> = Promise.resolve()

  function generate(id: string, file: File): Promise<void> {
    releasedIds.delete(id)
    chain = chain.then(async () => {
      if (!import.meta.client) return
      if (disposed || releasedIds.has(id)) return
      const url = await drawPreview(file)
      if (!url) return
      if (disposed || releasedIds.has(id)) { URL.revokeObjectURL(url); return }
      previews.value.set(id, url)
    })
    return chain
  }

  function previewFor(id: string): string | undefined {
    return previews.value.get(id)
  }

  function release(id: string) {
    releasedIds.add(id)
    const url = previews.value.get(id)
    if (url === undefined) return
    URL.revokeObjectURL(url)
    previews.value.delete(id)
  }

  function releaseAll() {
    disposed = true
    for (const url of previews.value.values()) URL.revokeObjectURL(url)
    previews.value.clear()
  }

  return { generate, previewFor, release, releaseAll }
}
