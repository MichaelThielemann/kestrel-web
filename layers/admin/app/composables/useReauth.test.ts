import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './useApi'
import { createReauthQueue, retryAfterReauth } from './useReauth'

const reauthRequired = () => new ApiError(403, 'confirm your password to continue', 'REAUTH_REQUIRED')

describe('retryAfterReauth', () => {
  it('asks for the password on REAUTH_REQUIRED and repeats the call once it is confirmed', async () => {
    const call = vi.fn().mockRejectedValueOnce(reauthRequired()).mockResolvedValueOnce('done')
    const confirm = vi.fn().mockResolvedValue(true)
    await expect(retryAfterReauth(call, confirm)).resolves.toBe('done')
    expect(confirm).toHaveBeenCalledOnce()
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('gives up with the original error when the dialog is cancelled', async () => {
    const error = reauthRequired()
    const call = vi.fn().mockRejectedValue(error)
    await expect(retryAfterReauth(call, () => Promise.resolve(false))).rejects.toBe(error)
    expect(call).toHaveBeenCalledOnce()
  })

  it('passes any other error straight through without asking', async () => {
    const error = new ApiError(403, 'forbidden', 'FORBIDDEN')
    const confirm = vi.fn()
    await expect(retryAfterReauth(() => Promise.reject(error), confirm)).rejects.toBe(error)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('createReauthQueue', () => {
  it('opens once for concurrent requests and answers all of them together', async () => {
    const queue = createReauthQueue()
    const first = queue.request()
    const second = queue.request()
    expect(queue.isOpen()).toBe(true)
    queue.settle(true)
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(queue.isOpen()).toBe(false)
  })

  it('answers false to every waiting request when cancelled', async () => {
    const queue = createReauthQueue()
    const waiting = queue.request()
    queue.settle(false)
    await expect(waiting).resolves.toBe(false)
  })
})
