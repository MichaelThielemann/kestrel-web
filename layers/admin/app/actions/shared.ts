import { defineAction, type ActionDefinition } from '#kestrel-core/app/utils/actions'
import type { Capability } from '#kestrel-admin/types/kestrel'
import { buildDeleteReport, type BatchDeleteReport } from '../utils/collection-ops'
import { referencesPrecheck } from './steps/api'
import { guardSelection } from './steps/guard'
import type { WithDeps } from './types'

export interface PreviewDeleteInput extends WithDeps {
  collection: string
  ids: readonly string[]
  capability: Capability | undefined
}

export function previewDeleteAction(name: string): ActionDefinition<PreviewDeleteInput, BatchDeleteReport> {
  return defineAction<PreviewDeleteInput, BatchDeleteReport>({
    name,
    steps: [
      guardSelection<PreviewDeleteInput, BatchDeleteReport>((ctx) => ctx.input.ids),
      referencesPrecheck<PreviewDeleteInput, BatchDeleteReport>('references.precheck', {
        capability: (ctx) => ctx.input.capability,
        ids: (ctx) => ctx.input.ids,
        onError: 'stop',
        onDone: (ctx, report) => {
          ctx.result = buildDeleteReport([...ctx.input.ids], report.byId, report.checked, ctx.input.collection, report.verifiable)
        },
      }),
    ],
  })
}
