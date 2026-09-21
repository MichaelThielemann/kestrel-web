import { describe, expectTypeOf, it } from 'vitest'
import type { operations } from './openapi.generated'
import type { MediaItem, ReplicationSnapshotResult, ReplicationStatus } from './api'

type GeneratedMediaItem = operations['getMedia']['responses'][200]['content']['application/json']
type GeneratedReplicationStatus = operations['replicationStatus']['responses'][200]['content']['application/json']
type GeneratedReplicationSnapshotResult = operations['replicationSnapshot']['responses'][200]['content']['application/json']

describe('the public alias types match the generated OpenAPI types at their published optionality', () => {
  it('MediaItem', () => {
    expectTypeOf<MediaItem>().toEqualTypeOf<GeneratedMediaItem>()
    expectTypeOf<MediaItem['width']>().toEqualTypeOf<number | null>()
    expectTypeOf<MediaItem['height']>().toEqualTypeOf<number | null>()
    expectTypeOf<MediaItem['alt']>().toEqualTypeOf<string | null>()
    expectTypeOf<MediaItem['title']>().toEqualTypeOf<string | null>()
    expectTypeOf<MediaItem['description']>().toEqualTypeOf<string | null>()
  })

  it('ReplicationStatus', () => {
    expectTypeOf<ReplicationStatus>().toEqualTypeOf<GeneratedReplicationStatus>()
    expectTypeOf<ReplicationStatus['generation']>().toEqualTypeOf<string | null>()
    expectTypeOf<ReplicationStatus['lineage']>().toEqualTypeOf<number>()
    expectTypeOf<ReplicationStatus['shippedFrames']>().toEqualTypeOf<number>()
    expectTypeOf<ReplicationStatus['lastSyncAt']>().toEqualTypeOf<number | null>()
    expectTypeOf<ReplicationStatus['lastSnapshotAt']>().toEqualTypeOf<number | null>()
    expectTypeOf<ReplicationStatus['lastCheckpointAt']>().toEqualTypeOf<number | null>()
    expectTypeOf<ReplicationStatus['walBytes']>().toEqualTypeOf<number>()
    expectTypeOf<ReplicationStatus['pendingRestore']>().toEqualTypeOf<string | null>()
  })

  it('ReplicationSnapshotResult', () => {
    expectTypeOf<ReplicationSnapshotResult>().toEqualTypeOf<GeneratedReplicationSnapshotResult>()
    expectTypeOf<ReplicationSnapshotResult['generation']>().toEqualTypeOf<string>()
    expectTypeOf<ReplicationSnapshotResult['bytes']>().toEqualTypeOf<number>()
  })
})
