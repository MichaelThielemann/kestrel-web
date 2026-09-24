import { boundaryCast } from '#kestrel/cast'
import type { ApiRoute } from '../utils/capabilities'
import { apiUrl } from '../utils/capabilities'
import { toApiError, useApiToken } from './useApi'

export interface UploadProgress { loaded: number; total: number; percent: number }

export type UploadProgressCallback = (progress: UploadProgress) => void

export type UploadTransport = <T>(route: ApiRoute, body: FormData, onProgress?: UploadProgressCallback) => Promise<T>

function parseJsonBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function useUploadTransport(): UploadTransport {
  const token = useApiToken()

  return function uploadRequest<T>(route: ApiRoute, body: FormData, onProgress?: UploadProgressCallback): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(route.method, apiUrl(route))
      const bearer = token.value
      if (bearer) xhr.setRequestHeader('authorization', `Bearer ${bearer}`)
      xhr.upload.onprogress = (event) => {
        if (!onProgress) return
        const total = event.lengthComputable ? event.total : 0
        const percent = total > 0 ? Math.round((event.loaded / total) * 100) : 0
        onProgress({ loaded: event.loaded, total, percent })
      }
      xhr.onload = () => {
        const data = parseJsonBody(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(boundaryCast<T>(data, 'json'))
        else reject(toApiError({ status: xhr.status, data }))
      }
      xhr.onerror = () => reject(toApiError({ status: 0, data: undefined }))
      xhr.send(body)
    })
  }
}
