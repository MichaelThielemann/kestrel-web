import { describe, expect, it } from 'vitest'
import { defineAction, runAction } from '#kestrel-core/app/utils/actions'
import { dialogConfirm, guardSelection } from './guard'

describe('guards', () => {
  it('guard.selection fails on an empty selection', async () => {
    const action = defineAction<{ ids: string[] }>({ name: 'g', steps: [guardSelection<{ ids: string[] }>((ctx) => ctx.input.ids)] })

    expect(await runAction(action, { ids: [] })).toEqual({ ok: false, error: 'guard.selection' })
    expect(await runAction(action, { ids: ['a'] })).toEqual({ ok: true })
  })

  it('dialog.confirm fails on an unconfirmed dialog', async () => {
    const action = defineAction<{ confirmed: boolean }>({ name: 'g', steps: [dialogConfirm<{ confirmed: boolean }>((ctx) => ctx.input.confirmed)] })

    expect(await runAction(action, { confirmed: false })).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(await runAction(action, { confirmed: true })).toEqual({ ok: true })
  })
})
