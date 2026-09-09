import { describe, expect, it } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import type { SerializedBlock, SerializedField } from '#kestrel-admin/types/kestrel'
import {
  CLIPBOARD_MARKER,
  CLIPBOARD_VERSION,
  countBlocks,
  normalizeClipboardBlocks,
  parseClipboardPayload,
  serializeClipboardPayload,
  type ClipboardBlockNode,
} from './block-clipboard'
import type { BlockRow } from './block-tree'

const textField: SerializedField = { type: 'text', required: false, unique: false }

const schemas: Record<string, SerializedBlock> = {
  hero: { name: 'hero', slots: ['default'], fields: { heading: textField, cta: textField } },
  quote: { name: 'quote', fields: { text: textField } },
}

function genId(): () => string {
  let n = 0
  return () => `id-${++n}`
}

describe('normalizeClipboardBlocks slots', () => {
  it('keeps only the slots the current schema declares', () => {
    const withSlots: Record<string, SerializedBlock> = { ...schemas, columns: { name: 'columns', slots: ['left'], fields: {} } }
    const nodes: ClipboardBlockNode[] = [{ type: 'columns', slots: { left: [{ type: 'quote', props: { text: 'q' } }], gone: [{ type: 'quote', props: {} }] } }]
    const out = normalizeClipboardBlocks(nodes, withSlots, genId())
    expect(out.blocks).toEqual([{ id: 'id-1', type: 'columns', props: {}, slots: { left: [{ id: 'id-2', type: 'quote', props: { text: 'q' } }] } }])
  })
})

describe('serializeClipboardPayload / parseClipboardPayload', () => {
  it('round-trips a block tree through the marker envelope', () => {
    const blocks: BlockRow[] = [{ id: 'a', type: 'hero', props: { heading: 'x' } }]
    const text = serializeClipboardPayload(blocks)
    expect(JSON.parse(text)).toEqual({ kestrel: 'blocks', version: 1, blocks })
    expect(parseClipboardPayload(text)).toEqual(blocks)
  })

  it('rejects invalid JSON', () => {
    expect(parseClipboardPayload('not json')).toBeNull()
  })

  it('rejects null, empty and non-object input', () => {
    expect(parseClipboardPayload(null)).toBeNull()
    expect(parseClipboardPayload('')).toBeNull()
    expect(parseClipboardPayload('42')).toBeNull()
  })

  it('rejects a payload with the wrong marker', () => {
    expect(parseClipboardPayload(JSON.stringify({ kestrel: 'other', version: 1, blocks: [] }))).toBeNull()
  })

  it('rejects a payload with the wrong version', () => {
    expect(parseClipboardPayload(JSON.stringify({ kestrel: CLIPBOARD_MARKER, version: 2, blocks: [] }))).toBeNull()
  })

  it('rejects a payload whose blocks field is not an array', () => {
    expect(parseClipboardPayload(JSON.stringify({ kestrel: CLIPBOARD_MARKER, version: CLIPBOARD_VERSION, blocks: {} }))).toBeNull()
  })
})

describe('countBlocks', () => {
  it('counts a flat list', () => {
    expect(countBlocks([{ }, { }])).toBe(2)
  })

  it('counts nested slot children recursively', () => {
    const nodes = [{ slots: { default: [{ }, { slots: { aside: [{ }] } }] } }]
    expect(countBlocks(nodes)).toBe(4)
  })
})

describe('normalizeClipboardBlocks', () => {
  it('assigns new ids for every node, recursively', () => {
    const nodes: ClipboardBlockNode[] = [
      { id: 'old-a', type: 'hero', props: { heading: 'x' }, slots: { default: [{ id: 'old-b', type: 'quote', props: { text: 't' } }] } },
    ]
    const { blocks, skippedTypes } = normalizeClipboardBlocks(nodes, schemas, genId())
    expect(skippedTypes).toEqual([])
    expect(blocks).toEqual([
      { id: 'id-1', type: 'hero', props: { heading: 'x' }, slots: { default: [{ id: 'id-2', type: 'quote', props: { text: 't' } }] } },
    ])
  })

  it('skips unknown block types and reports them without throwing', () => {
    const nodes: ClipboardBlockNode[] = [
      { type: 'hero', props: { heading: 'x' } },
      { type: 'unknown-block', props: { any: 1 } },
    ]
    const { blocks, skippedTypes } = normalizeClipboardBlocks(nodes, schemas, genId())
    expect(blocks).toEqual([{ id: 'id-1', type: 'hero', props: { heading: 'x' } }])
    expect(skippedTypes).toEqual(['unknown-block'])
  })

  it('skips an unknown type nested in a slot without dropping its valid siblings', () => {
    const nodes: ClipboardBlockNode[] = [
      { type: 'hero', props: {}, slots: { default: [{ type: 'quote', props: { text: 't' } }, { type: 'legacy', props: {} }] } },
    ]
    const { blocks, skippedTypes } = normalizeClipboardBlocks(nodes, schemas, genId())
    expect(blocks).toEqual([{ id: 'id-1', type: 'hero', props: {}, slots: { default: [{ id: 'id-2', type: 'quote', props: { text: 't' } }] } }])
    expect(skippedTypes).toEqual(['legacy'])
  })

  it('drops unknown props and leaves missing ones absent', () => {
    const nodes: ClipboardBlockNode[] = [{ type: 'hero', props: { heading: 'x', stale: 1 } }]
    const { blocks } = normalizeClipboardBlocks(nodes, schemas, genId())
    expect(blocks[0]!.props).toEqual({ heading: 'x' })
    expect('cta' in blocks[0]!.props).toBe(false)
  })

  it('treats a block with no props as an empty props object', () => {
    const nodes: ClipboardBlockNode[] = [{ type: 'quote' }]
    const { blocks } = normalizeClipboardBlocks(nodes, schemas, genId())
    expect(blocks).toEqual([{ id: 'id-1', type: 'quote', props: {} }])
  })

  it('ignores malformed entries in the node list', () => {
    const nodes = boundaryCast<ClipboardBlockNode[]>([null, 'x', 42, { type: 'hero', props: {} }], 'json')
    const { blocks } = normalizeClipboardBlocks(nodes, schemas, genId())
    expect(blocks).toEqual([{ id: 'id-1', type: 'hero', props: {} }])
  })
})
