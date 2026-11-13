import type { ListPage, MediaItem, ReferenceTo } from '#kestrel-admin/types/api'
import type { Capability } from '#kestrel-admin/types/kestrel'
import { defineAction } from '#kestrel-core/app/utils/actions'
import { apiErrorText, toApiError } from '../composables/useApi'
import { routeFrom } from '../utils/capabilities'
import { defineUiStep } from './define'
import type { ActionDeps, WithDeps } from './types'

/** Ids per request on the bulk media routes; the server refuses more. */
export const MEDIA_BLOCK_SIZE = 200

const FOLDER_PAGE_SIZE = 100

/** Splits a list into consecutive blocks of at most `size` entries. */
export function inBlocks<T>(list: readonly T[], size = MEDIA_BLOCK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export interface PreviewMediaDeleteInput extends WithDeps {
  fileIds: readonly string[]
  /** Folders being removed; the files anywhere below them are checked too. */
  folderPaths?: readonly string[]
  /** `mediaReferrersMany`, asked in blocks of 200 ids. */
  many?: Capability
  /** `mediaReferrers`, asked once per id when `many` is missing. */
  one?: Capability
  /** Whether the site tracks references; without them there is nothing to check. */
  tracked: boolean
  /** List the files below `folderPaths` even when nothing needs checking. */
  listFolders?: boolean
}

export interface DeletePrecheck {
  /** Referrers per file id, only for ids that have at least one. */
  references: Map<string, ReferenceTo[]>
  /** The files below the folders being removed. */
  folderFiles: MediaItem[]
  /** Every file was looked up. */
  checked: boolean
  /** The lookup was refused for this account. */
  forbidden: boolean
  /** The site tracks references; `false` means nothing needed checking. */
  tracked: boolean
  /** Why a lookup request failed, with its HTTP status and error id; null when none failed. */
  failure: string | null
}

async function filesBelow(deps: ActionDeps, path: string): Promise<MediaItem[]> {
  const out: MediaItem[] = []
  for (let offset = 0; ; offset += FOLDER_PAGE_SIZE) {
    const page = await deps.api<ListPage<MediaItem>>(deps.capabilities.route('listMedia'), {
      query: { folder: path, recursive: true, limit: FOLDER_PAGE_SIZE, offset },
    })
    out.push(...page.items)
    if (page.items.length < FOLDER_PAGE_SIZE || out.length >= page.total) return out
  }
}

async function lookup(input: PreviewMediaDeleteInput, ids: readonly string[], references: Map<string, ReferenceTo[]>): Promise<void> {
  const { deps, many, one } = input
  if (many) {
    for (const block of inBlocks(ids)) {
      const found = await deps.api<Record<string, ReferenceTo[]>>(routeFrom(many), { query: { ids: block.join(',') } })
      for (const id of block) {
        const refs = found[id]
        if (refs?.length) references.set(id, refs)
      }
    }
    return
  }
  if (!one) throw new Error('no referrers route')
  for (const id of ids) {
    const refs = await deps.api<ReferenceTo[]>(routeFrom(one, { id }))
    if (refs.length) references.set(id, refs)
  }
}

const precheck = defineUiStep<PreviewMediaDeleteInput, DeletePrecheck>('media.precheck', async (ctx) => {
  const { deps, tracked } = ctx.input
  const report: DeletePrecheck = { references: new Map(), folderFiles: [], checked: false, forbidden: false, tracked, failure: null }
  ctx.result = report
  if (!tracked && !ctx.input.listFolders) return
  try {
    for (const path of ctx.input.folderPaths ?? []) report.folderFiles.push(...await filesBelow(deps, path))
    if (!tracked || (!ctx.input.many && !ctx.input.one)) return
    await lookup(ctx.input, [...new Set([...ctx.input.fileIds, ...report.folderFiles.map((f) => f.id)])], report.references)
    report.checked = true
  } catch (e) {
    report.forbidden = toApiError(e).code === 'FORBIDDEN'
    report.failure = apiErrorText(deps.t, e, deps.t('media.remove.unverified'))
    report.references.clear()
  }
})

/** Looks up which of the files, and of the files below the folders, pages still use. */
export const previewDeleteItems = defineAction<PreviewMediaDeleteInput, DeletePrecheck>({
  name: 'previewDeleteItems',
  steps: [precheck],
})

/** Whether a removal must stop at a dialog: something is in use, or the site tracks references and the lookup did not finish. */
export function needsWarning(report: DeletePrecheck): boolean {
  return report.tracked && (!report.checked || report.references.size > 0)
}
