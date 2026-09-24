import { describe, expectTypeOf, it } from 'vitest'
import type { DeadEvent, EventDeliveryStatus, EventRelayStatus, MediaItem, ReplicationSnapshotResult, ReplicationStatus, RevisionRestoreResponse } from './api'

interface ExpectedMediaItem {
  alt: string | null
  checksum: string | null
  contentType: string
  createdAt: number
  description: string | null
  filename: string
  folder: string
  height: number | null
  id: string
  key: string
  provenance: {
    at?: number
    model?: string
    origin: 'human' | 'ai' | 'mixed' | 'unknown'
    tool?: string
  }
  size: number
  status: 'uploading' | 'ready' | 'failed'
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
})
