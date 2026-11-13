import { describe, expectTypeOf, it } from 'vitest'
import type { AnonymousOf, DeadEvent, EventDeliveryStatus, EventRelayStatus, MediaItem, PublishStatusEntry, RedirectHit, ReplicationSnapshotResult, ReplicationStatus, RevisionRestoreResponse, StaleStatus } from './api'

interface ExpectedMediaItem {
  alt: string | null
  available: boolean
  contentType: string
  createdAt: number
  description: string | null
  filename: string
  folder: string
  height: number | null
  id: string
  path: string
  provenance: {
    at?: number
    model?: string
    origin: 'human' | 'ai' | 'mixed' | 'unknown'
    tool?: string
  }
  size: number
  title: string | null
  updatedAt: number
  variantCounts: {
    done: number
    error: number
    failed: number
    pending: number
  }
  variants: {
    bytes: number
    format: string
    height: number
    path: string
    size: string
    state: 'pending' | 'done' | 'error' | 'failed'
    width: number
  }[]
  width: number | null
}

interface ExpectedReplicationStatus {
  generation: string | null
  lastCheckpointAt: number | null
  lastSnapshotAt: number | null
  lastSyncAt: number | null
  lineage: number
  pendingRestore: string | null
  shippedFrames: number
  walBytes: number
}

interface ExpectedReplicationSnapshotResult {
  bytes: number
  generation: string
}

interface ExpectedDeadEvent {
  id: string
  name: string
  pipeline: string
  runId: string
  attempts: number
  error: string
  createdAt: number
  availableAt: number
}

interface ExpectedEventRelayStatus {
  status: 'done' | 'error' | 'pending' | 'queued'
  pipelines: {
    event: string
    pipeline: string
    status: 'done' | 'error' | 'pending' | 'queued'
    attempts: number
    dead: boolean
    error: string | null
  }[]
}

interface ExpectedEventDeliveryStatus {
  dead: number
  scope: 'store' | 'process'
  since: number | null
  lastDeadAt: number | null
}

interface ExpectedStaleStatus {
  stale: number
  failed: number
  rendering: number
  unknown: number
  oldestStaleAt: number | null
  abandoned: number
  exports: {
    indexes: ExpectedExportOutcome | null
    llmsFull: ExpectedExportOutcome | null
  }
}

interface ExpectedExportOutcome {
  at: number
  entries: number
  error: string | null
  skipped: boolean
}

describe('the public API types keep exactly their published shape', () => {
  it('MediaItem', () => {
    expectTypeOf<MediaItem>().toEqualTypeOf<ExpectedMediaItem>()
  })

  it('ReplicationStatus', () => {
    expectTypeOf<ReplicationStatus>().toEqualTypeOf<ExpectedReplicationStatus>()
  })

  it('ReplicationSnapshotResult', () => {
    expectTypeOf<ReplicationSnapshotResult>().toEqualTypeOf<ExpectedReplicationSnapshotResult>()
  })

  it('DeadEvent, including the runId of the run that raised the dead row', () => {
    expectTypeOf<DeadEvent>().toEqualTypeOf<ExpectedDeadEvent>()
  })

  it('EventRelayStatus, the `_events` member events.relay adds to a write response', () => {
    expectTypeOf<EventRelayStatus>().toEqualTypeOf<ExpectedEventRelayStatus>()
  })

  it('EventDeliveryStatus, the deliveries a delivery module gave up on', () => {
    expectTypeOf<EventDeliveryStatus>().toEqualTypeOf<ExpectedEventDeliveryStatus>()
  })

  it('RevisionRestoreResponse extends the document with the restore report and the relay status', () => {
    expectTypeOf<Pick<RevisionRestoreResponse, 'restore' | '_events'>>().toEqualTypeOf<{ restore?: import('./api').RestoreReport, _events?: EventRelayStatus }>()
  })

  it('StaleStatus, the re-render backlog of the static delivery and the outcome of its last index exports', () => {
    expectTypeOf<StaleStatus>().toEqualTypeOf<ExpectedStaleStatus>()
  })

  it('PublishStatusEntry carries whether the output waits for or failed its re-render', () => {
    expectTypeOf<Pick<PublishStatusEntry, 'stale' | 'staleSince' | 'staleFailed' | 'staleError' | 'dependencies'>>().toEqualTypeOf<{
      stale: boolean
      staleSince: number | null
      staleFailed: boolean
      staleError: string | null
      dependencies: number | null
    }>()
  })

  it('RedirectHit narrows status to the codes a redirect rule can compile to', () => {
    expectTypeOf<RedirectHit>().toEqualTypeOf<{ status: 301 | 302 | 307 | 308, to: string }>()
  })

  it('AnonymousOf reads the anonymous answer of an operation that documents one, and refuses any other', () => {
    expectTypeOf<AnonymousOf<'getMedia'>>().toHaveProperty('path')
    expectTypeOf<AnonymousOf<'getMedia'>>().not.toHaveProperty('folder')
    // @ts-expect-error createPage documents no anonymous answer
    expectTypeOf<AnonymousOf<'createPage'>>().toBeNever()
  })
})
