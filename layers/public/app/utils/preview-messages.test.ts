import { describe, expect, it } from 'vitest'
import { parsePreviewMessage, readyMessage, selectMessage, selectedMessage } from './preview-messages'

const ORIGIN = 'https://example.test'

function messageEvent(data: unknown, origin = ORIGIN): MessageEvent {
  return new MessageEvent('message', { data, origin })
}

describe('build helpers', () => {
  it('builds a select message', () => {
    expect(selectMessage('b1')).toEqual({ type: 'kestrel-preview:select', id: 'b1' })
    expect(selectMessage(null)).toEqual({ type: 'kestrel-preview:select', id: null })
  })

  it('builds a selected message', () => {
    expect(selectedMessage('b1')).toEqual({ type: 'kestrel-preview:selected', id: 'b1' })
    expect(selectedMessage(null)).toEqual({ type: 'kestrel-preview:selected', id: null })
  })


  it('builds a ready message', () => {
    expect(readyMessage()).toEqual({ type: 'kestrel-preview:ready' })
  })
})

describe('parsePreviewMessage', () => {
  it('parses a select message from the expected origin', () => {
    expect(parsePreviewMessage(messageEvent(selectMessage('b1')), ORIGIN)).toEqual(selectMessage('b1'))
  })

  it('parses a selected message from the expected origin', () => {
    expect(parsePreviewMessage(messageEvent(selectedMessage(null)), ORIGIN)).toEqual(selectedMessage(null))
  })



  it('parses a ready message from the expected origin', () => {
    expect(parsePreviewMessage(messageEvent(readyMessage()), ORIGIN)).toEqual(readyMessage())
  })

  it('rejects a message from a different origin', () => {
    expect(parsePreviewMessage(messageEvent(selectMessage('b1'), 'https://evil.test'), ORIGIN)).toBeNull()
  })

  it('rejects a malformed payload', () => {
    expect(parsePreviewMessage(messageEvent(null), ORIGIN)).toBeNull()
    expect(parsePreviewMessage(messageEvent('a string'), ORIGIN)).toBeNull()
    expect(parsePreviewMessage(messageEvent({ type: 'kestrel-preview:select', id: 42 }), ORIGIN)).toBeNull()
    expect(parsePreviewMessage(messageEvent({ type: 'unknown' }), ORIGIN)).toBeNull()
  })
})
