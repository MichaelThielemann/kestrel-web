import { describe, expect, it } from 'vitest'
import { canDeleteTargets, canMoveTargets, canRenameTarget } from './media-capabilities'

const allow = { canDeleteFile: true, canDeleteFolder: true, canRenameFile: true, canRenameFolder: true }
const none = { canDeleteFile: false, canDeleteFolder: false, canRenameFile: false, canRenameFolder: false }

describe('canDeleteTargets', () => {
  it('allows a file-only batch with only the file capability', () => {
    expect(canDeleteTargets([{ type: 'file' }], { ...none, canDeleteFile: true })).toBe(true)
  })

  it('refuses a file-only batch without the file capability', () => {
    expect(canDeleteTargets([{ type: 'file' }], none)).toBe(false)
  })

  it('refuses a mixed batch missing either capability', () => {
    expect(canDeleteTargets([{ type: 'file' }, { type: 'folder' }], { ...none, canDeleteFile: true })).toBe(false)
  })

  it('allows a mixed batch with both capabilities', () => {
    expect(canDeleteTargets([{ type: 'file' }, { type: 'folder' }], allow)).toBe(true)
  })

  it('allows an empty batch regardless of capabilities', () => {
    expect(canDeleteTargets([], none)).toBe(true)
  })
})

describe('canRenameTarget', () => {
  it('checks the file capability for a file', () => {
    expect(canRenameTarget({ type: 'file' }, { ...none, canRenameFile: true })).toBe(true)
    expect(canRenameTarget({ type: 'file' }, { ...allow, canRenameFile: false })).toBe(false)
  })

  it('checks the folder capability for a folder', () => {
    expect(canRenameTarget({ type: 'folder' }, { ...none, canRenameFolder: true })).toBe(true)
    expect(canRenameTarget({ type: 'folder' }, { ...allow, canRenameFolder: false })).toBe(false)
  })
})

describe('canMoveTargets', () => {
  it('refuses moving a folder into a batch with only the file capability', () => {
    expect(canMoveTargets([{ type: 'file' }, { type: 'folder' }], { ...none, canRenameFile: true })).toBe(false)
  })

  it('allows moving files and folders together with both capabilities', () => {
    expect(canMoveTargets([{ type: 'file' }, { type: 'folder' }], allow)).toBe(true)
  })
})
