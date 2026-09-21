import { describe, expectTypeOf, it } from 'vitest'
import type { operations } from './openapi.generated'
import type { MediaItem, ReplicationSnapshotResult, ReplicationStatus } from './api'

type GeneratedMediaItem = operations['getMedia']['responses'][200]['content']['application/json']
type GeneratedReplicationStatus = operations['replicationStatus']['responses'][200]['content']['application/json']
type GeneratedReplicationSnapshotResult = operations['replicationSnapshot']['responses'][200]['content']['application/json']

describe('generated OpenAPI types still under-declare the fields api.ts re-requires', () => {
  it('getMedia still marks width/height/alt/title/description optional; once this fails, drop RequireFields<MediaItemResponse, ...> for MediaItem in api.ts', () => {
    expectTypeOf<GeneratedMediaItem['width']>().toEqualTypeOf<number | null | undefined>()
    expectTypeOf<GeneratedMediaItem['height']>().toEqualTypeOf<number | null | undefined>()
    expectTypeOf<GeneratedMediaItem['alt']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<GeneratedMediaItem['title']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<GeneratedMediaItem['description']>().toEqualTypeOf<string | null | undefined>()
  })

  it('replicationStatus still marks every field optional; once this fails, drop RequireFields<..., 200>, ...> for ReplicationStatus in api.ts', () => {
    expectTypeOf<GeneratedReplicationStatus['generation']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<GeneratedReplicationStatus['lineage']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<GeneratedReplicationStatus['shippedFrames']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<GeneratedReplicationStatus['lastSyncAt']>().toEqualTypeOf<number | null | undefined>()
    expectTypeOf<GeneratedReplicationStatus['lastSnapshotAt']>().toEqualTypeOf<number | null | undefined>()
    expectTypeOf<GeneratedReplicationStatus['lastCheckpointAt']>().toEqualTypeOf<number | null | undefined>()
    expectTypeOf<GeneratedReplicationStatus['walBytes']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<GeneratedReplicationStatus['pendingRestore']>().toEqualTypeOf<string | null | undefined>()
  })

  it('replicationSnapshot still marks generation/bytes optional; once this fails, drop RequireFields<..., 200>, ...> for ReplicationSnapshotResult in api.ts', () => {
    expectTypeOf<GeneratedReplicationSnapshotResult['generation']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<GeneratedReplicationSnapshotResult['bytes']>().toEqualTypeOf<number | undefined>()
  })
})

describe('the public alias types keep the optionality published before the OpenAPI-derived types', () => {
  it('MediaItem', () => {
    expectTypeOf<MediaItem['width']>().toEqualTypeOf<number | null>()
    expectTypeOf<MediaItem['height']>().toEqualTypeOf<number | null>()
    expectTypeOf<MediaItem['alt']>().toEqualTypeOf<string | null>()
    expectTypeOf<MediaItem['title']>().toEqualTypeOf<string | null>()
    expectTypeOf<MediaItem['description']>().toEqualTypeOf<string | null>()
  })

  it('ReplicationStatus', () => {
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
    expectTypeOf<ReplicationSnapshotResult['generation']>().toEqualTypeOf<string>()
    expectTypeOf<ReplicationSnapshotResult['bytes']>().toEqualTypeOf<number>()
  })
})
