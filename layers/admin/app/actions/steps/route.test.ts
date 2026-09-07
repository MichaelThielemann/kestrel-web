import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction } from '../../../../core/app/utils/actions'
import type { RefreshPort } from '../types'
import { dataReload, listRefresh, routeNavigate } from './route'

describe('route steps', () => {
  it('route.navigate skips a null destination', async () => {
    const navigate = vi.fn(async () => undefined)
    const action = defineAction<{ navigate: typeof navigate }>({ name: 'r', steps: [routeNavigate<{ navigate: typeof navigate }>(() => null)] })

    await runAction(action, { navigate })

    expect(navigate).not.toHaveBeenCalled()
  })

  it('list.refresh and data.reload await the same port under different names', async () => {
    const refresh: RefreshPort = vi.fn(async () => {})
    const list = listRefresh<{ refresh?: RefreshPort }>()
    const reload = dataReload<{ refresh?: RefreshPort }>()

    expect([list.name, reload.name]).toEqual(['list.refresh', 'data.reload'])

    await runAction(defineAction<{ refresh?: RefreshPort }>({ name: 'r', steps: [list, reload] }), { refresh })

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('a missing refresh port is a no-op', async () => {
    const result = await runAction(defineAction<{ refresh?: RefreshPort }>({ name: 'r', steps: [listRefresh<{ refresh?: RefreshPort }>()] }), {})

    expect(result).toEqual({ ok: true })
  })
})
