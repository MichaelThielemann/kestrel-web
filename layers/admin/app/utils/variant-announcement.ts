import type { Translate } from '#kestrel-admin/actions/types'

/** One file whose image variants were all generated, or some of which failed. */
export interface VariantResult {
  name: string
  failed: boolean
}

const NAMES_SHOWN = 3

function nameList(names: readonly string[], t: Translate): string {
  if (names.length <= NAMES_SHOWN) return names.join(', ')
  return t('media.upload.namesAndMore', { names: names.slice(0, NAMES_SHOWN).join(', '), n: names.length - NAMES_SHOWN })
}

/** One sentence for the files whose variants are ready and one for those with failed variants, each naming up to three files. */
export function variantAnnouncement(results: readonly VariantResult[], t: Translate): string {
  const ready = results.filter((r) => !r.failed).map((r) => r.name)
  const failed = results.filter((r) => r.failed).map((r) => r.name)
  const parts: string[] = []
  if (ready.length) parts.push(t('media.upload.variantsReady', { names: nameList(ready, t) }))
  if (failed.length) parts.push(t('media.upload.variantsFailed', { names: nameList(failed, t) }))
  return parts.join('. ')
}
