import type { ApplyResult, Migrations } from '@michaelthielemann/kestrel-contracts/migrations'
import type { Document as PersistedDocument } from '@michaelthielemann/kestrel-contracts/persistence'
import type { Ok } from '@michaelthielemann/kestrel/result'
import type { ImagesStatus as ImagesStatusDoc, Job as ImagesJobDoc } from '@michaelthielemann/kestrel-images-default/impl'
import type { MediaItem as MediaItemDoc, Provenance } from '@michaelthielemann/kestrel-media-default/impl'
import type { PublishStatus } from '@michaelthielemann/kestrel-delivery-static/impl'
import type { Point as ReplicationPointDoc, Replication, Status as ReplicationStatusDoc } from '@michaelthielemann/kestrel-replication-sqlite/impl'
import type { Feature } from '#kestrel/pipelines'
import type { SerializedCollection } from './kestrel'

export type { Provenance }

type OkValue<T> = T extends Ok<infer V> ? V : never

type Returns<F extends (...args: never[]) => unknown> = OkValue<Awaited<ReturnType<F>>>

export interface ApiFieldError { field: string; message: string }

export interface ApiRefProblem { field: string; to: string; id: string }

export interface ApiSchemaProblem { path: string; message: string }

export interface ApiErrorDetails {
  fields?: ApiFieldError[]
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

export interface ListPage<T> { items: T[]; total: number }

export interface Document extends PersistedDocument {
  createdAt: number
  updatedAt: number

  _locales?: Record<string, string>

  _translations?: Record<string, boolean>
}

export type PageStatus = 'draft' | 'finished' | 'published'

export interface PageSeo {
  title?: string
  description?: string
  noindex?: boolean
}

export interface PageDocument extends Document {
  slug: string | null
  title: string | null
  body: BlockNode[] | null
  seo: PageSeo | null

  status: PageStatus | null
  shareImage: string | null
  layout?: string | null
}

export interface RedirectHit { to: string; status: number }

export type SiteResponse = PageDocument | { redirect: RedirectHit }

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

export type ProvenanceOrigin = Provenance['origin']

export interface MediaVariant {
  size: string
  width: number
  height: number
  format: string
  bytes: number
  state: 'pending' | 'done' | 'error'
  path: string
}

export type MediaStatus = MediaItemDoc['status']

export interface MediaItem extends MediaItemDoc {
  variants: MediaVariant[]
}

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

export type DeliveryState = PublishStatus['state']

export type PublishStatusEntry = Pick<PublishStatus, 'locale' | 'state' | 'path' | 'error' | 'publishedAt' | 'updatedAt'>

export type DeliveryEntry = Omit<PublishStatusEntry, 'updatedAt'>

export interface SaveResponse<T> { document: T; delivery: DeliveryEntry[] }

export interface PublishAllReport {
  documents: number
  live: number
  errors: number
  redirects: { rules: number, skipped: number }
}

export type ReplicationStatus = ReplicationStatusDoc

export type RestorePointKind = ReplicationPointDoc['kind']

export type ReplicationPoint = ReplicationPointDoc

export type ReplicationSnapshotResult = Returns<Replication['snapshot']>

export type ReplicationRestoreResult = Returns<Replication['prepareRestore']>

export interface MediaExportReport { written: number; skipped: number; missing: number; conflicts: number; variants: { written: number; skipped: number } }

export type ImageSizeRow = ImagesStatusDoc['sizes'][number]

export type ImagesJob = ImagesJobDoc

export interface ImagesStatus {
  sizes: ImageSizeRow[]
  job: ImagesJob | null
  orphaned: { sizes: string[]; variants: number }
}

export interface ImagesPruneResult { sizes: number; variants: number }

export interface MediaReconcileReport { blobsWithoutRow: string[]; rowsWithoutBlob: string[] }

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
}

export interface InsightsModule {
  name: string
  use: string
  version: string | null
  provides: string[]
  requires: string[]
  optional: string[]
  config: { schema: JsonSchema; variables: InsightsConfigVariable[] }
  steps: string[]
  eventHook: boolean
}

export interface InsightsStep {
  name: string
  module: string
  factory: boolean
  description: InsightsStepDescription | null
}

export interface InsightsPipelineStep {
  spec: string
  name: string
  module: string
  description: InsightsStepDescription
}

export interface InsightsPipeline { name: string; steps: InsightsPipelineStep[] }

export interface InsightsHttpTrigger { method: string; path: string; pipeline: string }
export interface InsightsEventTrigger { event: string; pipeline: string }
export interface InsightsCronTrigger { expression: string; pipeline: string }

export interface InsightsManifest {
  generatedAt: number
  core: { version: string }
  contracts: string[]
  modules: InsightsModule[]
  steps: InsightsStep[]
  pipelines: InsightsPipeline[]
  triggers: { http: InsightsHttpTrigger[]; events: InsightsEventTrigger[]; crons: InsightsCronTrigger[] }
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

export interface DeadEvent { id: string; name: string; attempts: number; error: string; createdAt: number; availableAt: number }
export interface DeadEventsResponse { items: DeadEvent[] }
export interface EventsRetryResult { retried: number }

export interface AdminSchemaLocales { all: string[]; primary: string; prefixPrimary: boolean }

export interface AdminSchema {
  locales: AdminSchemaLocales
  collections: SerializedCollection[]
  features: Feature[]
}
