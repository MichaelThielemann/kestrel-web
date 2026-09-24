import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import { useUploadPreview } from './useUploadPreview'

function stubCanvas(blob: Blob | null) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(boundaryCast<CanvasRenderingContext2D>({ drawImage: vi.fn() }, 'dom'))
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob))
}

describe('useUploadPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draws a resized bitmap and exposes an object URL, closing the bitmap afterwards', async () => {
    const close = vi.fn()
    const bitmap = { width: 320, height: 200, close }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const blob = new Blob(['x'])
    stubCanvas(blob)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')

    const { generate, previewFor } = useUploadPreview()
    await generate('u1', new File(['x'], 'a.png', { type: 'image/png' }))

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { resizeWidth: 320 })
    expect(close).toHaveBeenCalledTimes(1)
    expect(previewFor('u1')).toBe('blob:preview-1')
  })

  it('falls back to no preview when the browser cannot decode the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))

    const { generate, previewFor } = useUploadPreview()
    await generate('u1', new File(['x'], 'a.heic', { type: 'image/heic' }))

    expect(previewFor('u1')).toBeUndefined()
  })

  it('processes uploads one at a time in call order', async () => {
    const order: string[] = []
    vi.stubGlobal('createImageBitmap', vi.fn().mockImplementation(async (file: File) => {
      order.push(`start:${file.name}`)
      await Promise.resolve()
      order.push(`end:${file.name}`)
      return { width: 10, height: 10, close: vi.fn() }
    }))
    stubCanvas(new Blob(['x']))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')

    const { generate } = useUploadPreview()
    const first = generate('u1', new File(['x'], 'a.png'))
    const second = generate('u2', new File(['x'], 'b.png'))
    await Promise.all([first, second])

    expect(order).toEqual(['start:a.png', 'end:a.png', 'start:b.png', 'end:b.png'])
  })

  it('revokes the object URL on release', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }))
    stubCanvas(new Blob(['x']))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { generate, previewFor, release } = useUploadPreview()
    await generate('u1', new File(['x'], 'a.png'))
    release('u1')

    expect(revoke).toHaveBeenCalledWith('blob:preview')
    expect(previewFor('u1')).toBeUndefined()
  })

  it('revokes a preview whose decode finishes after release() already ran', async () => {
    let resolveBitmap: ((bitmap: unknown) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn().mockImplementation(() => new Promise((resolve) => { resolveBitmap = resolve })))
    stubCanvas(new Blob(['x']))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { generate, previewFor, release } = useUploadPreview()
    const pending = generate('u1', new File(['x'], 'a.png'))
    await vi.waitFor(() => expect(resolveBitmap).toBeDefined())
    release('u1')
    resolveBitmap?.({ width: 10, height: 10, close: vi.fn() })
    await pending

    expect(revoke).toHaveBeenCalledWith('blob:preview')
    expect(previewFor('u1')).toBeUndefined()
  })

  it('revokes a preview whose decode finishes after releaseAll() already ran', async () => {
    let resolveBitmap: ((bitmap: unknown) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn().mockImplementation(() => new Promise((resolve) => { resolveBitmap = resolve })))
    stubCanvas(new Blob(['x']))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { generate, previewFor, releaseAll } = useUploadPreview()
    const pending = generate('u1', new File(['x'], 'a.png'))
    await vi.waitFor(() => expect(resolveBitmap).toBeDefined())
    releaseAll()
    resolveBitmap?.({ width: 10, height: 10, close: vi.fn() })
    await pending

    expect(revoke).toHaveBeenCalledWith('blob:preview')
    expect(previewFor('u1')).toBeUndefined()
  })

  it('skips decoding a file that was released before its turn in the queue', async () => {
    const decode = vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', decode)
    stubCanvas(new Blob(['x']))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')

    const { generate, previewFor, release } = useUploadPreview()
    const first = generate('u1', new File(['x'], 'a.png'))
    const second = generate('u2', new File(['x'], 'b.png'))
    release('u2')
    await Promise.all([first, second])

    expect(decode).toHaveBeenCalledTimes(1)
    expect(previewFor('u2')).toBeUndefined()
  })

  it('releaseAll revokes every held URL', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }))
    stubCanvas(new Blob(['x']))
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { generate, previewFor, releaseAll } = useUploadPreview()
    await generate('u1', new File(['x'], 'a.png'))
    await generate('u2', new File(['x'], 'b.png'))
    releaseAll()

    expect(revoke).toHaveBeenCalledWith('blob:one')
    expect(revoke).toHaveBeenCalledWith('blob:two')
    expect(previewFor('u1')).toBeUndefined()
    expect(previewFor('u2')).toBeUndefined()
  })
})
