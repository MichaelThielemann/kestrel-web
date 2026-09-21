import { describe, expectTypeOf, it } from 'vitest'
import type { DeadEvent, MediaItem, ReplicationSnapshotResult, ReplicationStatus } from './api'

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
  attempts: number
  error: string
  createdAt: number
  availableAt: number
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

  it('DeadEvent, including the pipeline field added for the per-pipeline dead letter', () => {
    expectTypeOf<DeadEvent>().toEqualTypeOf<ExpectedDeadEvent>()
  })
})
