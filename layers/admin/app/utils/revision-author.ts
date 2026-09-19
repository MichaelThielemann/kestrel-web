import type { RevisionAuthor } from '#kestrel-admin/types/api'
import type { Translate } from '../actions/types'

export function revisionAuthorName(t: Translate, author: RevisionAuthor): string {
  if (author.name !== null) return author.name
  return author.id === null ? t('revisions.deletedAuthor') : t('revisions.unknownAuthor')
}
