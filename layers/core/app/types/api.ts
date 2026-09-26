import type { ApplyResult, Migrations } from '@michaelthielemann/kestrel-contracts/migrations'
import type { Document as PersistedDocument } from '@michaelthielemann/kestrel-contracts/persistence'
import type { Ok } from '@michaelthielemann/kestrel/result'
import type { RestoreReport, Revision, RevisionAuthor, RevisionKind, RevisionPage, RevisionSummary } from '@michaelthielemann/kestrel-contracts/revisions'
import type { Feature } from '#kestrel/pipelines'
import type { components, operations } from './openapi.generated'
import type { AdminCollection, Capability } from './kestrel'

export type { RestoreReport, Revision, RevisionAuthor, RevisionKind, RevisionPage, RevisionSummary }

type ResponseOf<Operation extends keyof operations, Status extends keyof operations[Operation]['responses']> =
  operations[Operation]['responses'][Status] extends { content: { 'application/json': infer Body } } ? Body : never

type Schemas = components['schemas']

/** The documented answer of an operation to a caller whose roles keep every field. */
export type FullOf<Operation extends keyof Schemas & keyof operations> = Schemas[Operation]

/** The operations that document an answer for a caller without a session: the reads ending with `authz.fields`. */
export type AnonymousOperation = { [Operation in keyof operations & string]: `${Operation}.anonymous` extends keyof Schemas ? Operation : never }[keyof operations & string]

/** The documented answer of an operation to a caller without a session: only the fields the anonymous grant keeps. */
export type AnonymousOf<Operation extends AnonymousOperation> = Schemas[`${Operation}.anonymous` & keyof Schemas]

type OkValue<T> = T extends Ok<infer V> ? V : never

type Returns<F extends (...args: never[]) => unknown> = OkValue<Awaited<ReturnType<F>>>

export interface ApiFieldError { field: string; message: string }

export interface ApiRefProblem { field: string; to: string; id: string }

export interface ApiSchemaProblem { path: string; message: string }

/** A document that already holds a public path a save would take, from `site-default`'s `CONFLICT` answer. */
export interface ApiPathConflict {
  path: string
  locale: string
  type: string
  id: string
  label: string
  /** The document whose path collides, when the save moved it along (a subpage, a mounted document). */
  moving?: { type: string; id: string }
}

export interface ApiErrorDetails {
  fields?: ApiFieldError[]
  conflicts?: ApiPathConflict[]
  refs?: ApiRefProblem[]
  problems?: ApiSchemaProblem[]
  referrers?: ReferenceTo[]
  referenced?: string[]
  retryAfterSeconds?: number
}

export interface ApiErrorBody { error: string; code: string; retryable: boolean; runId?: string; step?: string; details?: ApiErrorDetails }

export interface Identity { id: string; claims: { username: string; roles: string[] } }
export interface LoginResponse { token: string; identity: Identity }

export interface User { id: string; username: string; roles: string[]; active: boolean; createdAt: number }

export type UserDeleteResponse = ResponseOf<'deleteUser', 200>
export type UserReassignTarget = NonNullable<UserDeleteResponse['reassignTo']>

export interface ListPage<T> { items: T[]; total: number }

/** A stored document as a caller without a session receives it: no timestamps. */
export interface PublicDocument extends PersistedDocument {
  _locales?: Record<string, string>

  _translations?: Record<string, boolean>
}

export interface Document extends PublicDocument {
  createdAt: number
  updatedAt: number
}

export type PageStatus = 'draft' | 'finished' | 'published'

export interface PageSeo {
  title?: string
  description?: string
  noindex?: boolean
}

interface PublicPageFields extends PublicDocument {
  slug: string | null
  title: string | null
  body: BlockNode[] | null
  seo: PageSeo | null

  status: PageStatus | null
  shareImage: string | null
  layout?: string | null
  _paths?: Record<string, string | null>
}

type NamedKeys<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] }

type AnonymousPage = Exclude<AnonymousOf<'resolvePage'>, { redirect: unknown }>

type MatchesAnonymousPage<T> = [Exclude<NamedKeys<T>, keyof AnonymousPage>] extends [never] ? ([Extract<'createdAt' | 'updatedAt', keyof AnonymousPage>] extends [never] ? T : never) : never

/**
 * A page as a public page's data carries it for every visitor, signed in or not: the page without its
 * timestamps. It is `never` when a field it names is missing from the anonymous `resolvePage` answer the API
 * documents, or when that answer carries the timestamps.
 */
export type PublicPageDocument = MatchesAnonymousPage<PublicPageFields>

export interface PageDocument extends PublicPageFields {
  createdAt: number
  updatedAt: number
}

export type RedirectHit = Extract<FullOf<'resolvePage'>, { redirect: unknown }>['redirect']

export type SiteResponse = PageDocument | { redirect: RedirectHit }

/** What the public layer keeps of a `/site/*` answer: a public page or a redirect hit. */
export type PublicSiteResponse = PublicPageDocument | { redirect: RedirectHit }

export interface RedirectRule { from: string; to: string; status?: string }

export interface RedirectsDocument extends Document {
  rules: RedirectRule[] | null
}

export interface PublicRedirectRule { pattern: string; target: string; status: number }

export interface SettingsDocument extends Document {
  title: string | null
  description?: unknown
  navigation: unknown
  titleSeparator?: unknown
  titlePosition?: unknown
}

export interface BlockNode {
  id?: string
  type: string
  props?: Record<string, unknown>
  slots?: Record<string, BlockNode[]>
}

type MediaItemResponse = FullOf<'getMedia'>

export type Provenance = MediaItemResponse['provenance']

export type ProvenanceOrigin = Provenance['origin']

export type MediaVariant = MediaItemResponse['variants'][number]

export type MediaVariantCounts = MediaItemResponse['variantCounts']

export type MediaItem = MediaItemResponse

export interface MediaFolder { folder: string; count: number }

export interface MediaFolderRenameResponse { folder: string; moved: number }

export interface MediaFolderDeleteResponse { ok: boolean; removed: number }

export interface ReferenceTo { type: string; field: string; id: string }

export interface BrokenReference {
  fromType: string
  fromId: string
  field: string
  locale: string | null
  toTarget: string
  toId: string
  broken: boolean
  checkedAt: number
}

export interface BrokenLink {
  url: string
  fromType: string
  fromId: string
  field: string
  locale: string | null
  ok: boolean
  status: number | null
  error: string | null
  checkedAt: number
}

export interface RebuildReport { documents: number; entries: number }

export type PathPreview = ResponseOf<'previewPagePath', 200>

export type PathsRebuildReport = ResponseOf<'rebuildPaths', 200>

export type AutoRedirect = ResponseOf<'listAutoRedirects', 200>[number]

export type PageTreeNode = ResponseOf<'pageTree', 200>[number]

export type PublishStatusEntry = ResponseOf<'pagePublishStatus', 200>[number]

export type DeliveryState = PublishStatusEntry['state']

export type DeliveryEntry = Omit<PublishStatusEntry, 'updatedAt'>

export type EventRelayStatus = ResponseOf<'createPage', 200>['_events']

export type EventDeliveryStatus = ResponseOf<'eventsDeliveryStatus', 200>

export interface RevisionDetail extends Revision {
  restore?: RestoreReport
}

export type RevisionRestoreResponse = Document & { restore?: RestoreReport; _events?: EventRelayStatus }

/** What "Re-render all pages" answers: how many page outputs it marked for a re-render in the background. */
export interface PublishAllReport { marked: number }

/** The static delivery's re-render backlog: `stale` outputs wait, `failed` gave up after every attempt, `unknown` were rendered before their dependencies were recorded. */
export type StaleStatus = ResponseOf<'pagesStaleStatus', 200>

export interface RetryStaleReport { retried: number }

export type ReplicationStatus = ResponseOf<'replicationStatus', 200>

export type ReplicationPoint = ResponseOf<'replicationPoints', 200>[number]

export type RestorePointKind = ReplicationPoint['kind']

export type ReplicationSnapshotResult = ResponseOf<'replicationSnapshot', 200>

export type ReplicationRestoreResult = ResponseOf<'replicationRestore', 200>

export interface MediaExportReport { written: number; skipped: number; missing: number; conflicts: number; variants: { written: number; skipped: number } }

type ImagesStatusResponse = ResponseOf<'imagesStatus', 200>

export type ImageSizeRow = ImagesStatusResponse['sizes'][number]

export type ImagesJob = NonNullable<ImagesStatusResponse['job']>

export type ImagesFailedVariant = ImagesStatusResponse['failed']['recent'][number]

export interface ImagesStatus {
  sizes: ImageSizeRow[]
  job: ImagesJob | null
  orphaned: { sizes: string[]; variants: number }
  failed?: { variants: number; recent: ImagesFailedVariant[] }
}

export interface ImagesPruneResult { sizes: number; variants: number }

export interface ImagesRetryFailedResult { variants: number; media: number; job: ImagesJob | null }

export interface MediaReconcileReport { blobsWithoutRow: string[]; rowsWithoutBlob: string[] }

export interface MediaPublicSync { written: number; removed: number; missing: number }

export interface MediaRepairPublicReport { _publicMedia: MediaPublicSync; _publicVariants?: MediaPublicSync & { planned: number } }

export type { LedgerEntry as MigrationLedgerEntry, PendingMigration } from '@michaelthielemann/kestrel-contracts/migrations'
export type MigrationsListResult = Returns<Migrations['list']>
export type MigrationsDryRunResult = Extract<ApplyResult, { dry: true }>
export type MigrationsDryRunChange = MigrationsDryRunResult['changes'][number]
export type MigrationsApplyResult = Exclude<ApplyResult, { dry: true }>

export type JsonSchema = Record<string, unknown>

export interface InsightsStepDescription {
  summary: string
  reads: string[]
  writes: string[]
  input?: JsonSchema
  output?: JsonSchema
  extendsOutput?: JsonSchema
  extendsItems?: JsonSchema
  query?: Record<string, JsonSchema>
  errors?: Record<string, string>
  security?: 'required' | 'optional'
  multipart?: boolean
  binary?: boolean
}

export type InsightsVariableType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'record' | 'enum' | 'union' | 'literal' | 'function' | 'unknown'

export interface InsightsConfigVariable {
  path: string
  type: InsightsVariableType
  required: boolean
  default?: unknown
  secret: boolean
  set: boolean
  status?: 'set' | 'default' | 'missing'
  value?: unknown
  redacted?: boolean
}

type InsightsManifestBody = ResponseOf<'insightsManifest', 200>

export type InsightsModule = Omit<InsightsManifestBody['modules'][number], 'config'> & { config: { schema: JsonSchema; variables: InsightsConfigVariable[] } }

export interface InsightsStep {
  name: string
  module: string
  factory: boolean
  description: InsightsStepDescription | null
}

export type InsightsPipelineStep = InsightsManifestBody['pipelines'][number]['steps'][number]

export interface InsightsPipeline { name: string; steps: InsightsPipelineStep[] }

export interface InsightsHttpTrigger { method: string; path: string; pipeline: string }
export interface InsightsEventTrigger { event: string; pipeline: string }
export interface InsightsCronTrigger { expression: string; pipeline: string }

export type InsightsBootWarning = InsightsManifestBody['warnings'][number]

export interface InsightsManifest {
  generatedAt: number
  core: { version: string }
  contracts: string[]
  modules: InsightsModule[]
  steps: InsightsStep[]
  pipelines: InsightsPipeline[]
  triggers: { http: InsightsHttpTrigger[]; events: InsightsEventTrigger[]; crons: InsightsCronTrigger[] }
  warnings: InsightsBootWarning[]
}

export interface InsightsPipelineStats { name: string; count: number; failed: number; errors: number; p50Ms: number; p95Ms: number; lastAt: number | null }
export interface InsightsStepStats { pipeline: string; step: string; count: number; failed: number; errors: number; p50Ms: number; p95Ms: number }
export interface InsightsEventStats { name: string; count: number; lastAt: number | null }
export interface InsightsRatelimitBucket { key: string; remaining: number; resetAt: number }

export interface InsightsRecentFailure {
  at: number
  runId: string
  pipeline: string
  trigger: { kind: string; name: string }
  status: number
  ms: number
  code?: string
  step?: string
  message?: string
}

export interface InsightsStats {
  generatedAt: number
  process: { pid: number; startedAt: number; uptimeMs: number }
  runs: { active: number; total: number; failed: number; errors: number }
  pipelines: InsightsPipelineStats[]
  steps: InsightsStepStats[]
  events: InsightsEventStats[]
  ratelimit: InsightsRatelimitBucket[]
  recentFailures?: InsightsRecentFailure[]
}

export interface EventsQueueStatus {
  pending: number
  running: number
  dead: number
  done24h: number
  oldestPendingAt: number | null
  worker: { running: boolean; lastTickAt: number | null }
}

export type DeadEventsResponse = ResponseOf<'eventsDead', 200>
export type DeadEvent = DeadEventsResponse['items'][number]
export interface EventsRetryResult { retried: number }

export interface AdminSchemaLocales { all: string[]; primary: string; prefixPrimary: boolean }

export interface AdminSchema {
  locales: AdminSchemaLocales
  collections: AdminCollection[]
  features: Feature[]
  /** Pipelines outside any collection verb that the caller can reach and is not denied, by pipeline name; includes the consumer's own pipelines. */
  capabilities: Record<string, Capability>
}
