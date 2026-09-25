import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { useEditFormHistory } from './useEditFormHistory'

function setup() {
  const values = reactive<Record<string, unknown>>({ title: 'a' })
  let restored = 0
  const history = useEditFormHistory({ values, onRestore: () => { restored++ } })
  return { values, history, restoredCount: () => restored }
}

describe('useEditFormHistory', () => {
  it('has no undo or redo available before any change is recorded', () => {
    const { history } = setup()
    expect(history.canUndo.value).toBe(false)
    expect(history.canRedo.value).toBe(false)
  })

  it('undo restores the previous snapshot and enables redo', () => {
    const { values, history, restoredCount } = setup()
    history.recordHistory('title')
    values.title = 'b'
    expect(history.canUndo.value).toBe(true)

    history.undo()

    expect(values.title).toBe('a')
    expect(history.canRedo.value).toBe(true)
    expect(restoredCount()).toBe(1)
  })

  it('redo re-applies the change that was undone', () => {
    const { values, history } = setup()
    history.recordHistory('title')
    values.title = 'b'
    history.undo()

    history.redo()

    expect(values.title).toBe('b')
    expect(history.canRedo.value).toBe(false)
  })

  it('coalesces rapid changes to the same field into a single history entry', () => {
    const { values, history } = setup()
    history.recordHistory('title')
    values.title = 'b'
    history.recordHistory('title')
    values.title = 'c'

    history.undo()

    expect(values.title).toBe('a')
    expect(history.canUndo.value).toBe(false)
  })

  it('a new edit after undo clears the redo stack', () => {
    const { values, history } = setup()
    history.recordHistory('title')
    values.title = 'b'
    history.undo()

    history.recordHistory('title')
    values.title = 'c'

    expect(history.canRedo.value).toBe(false)
  })

  it('resetHistory clears both stacks', () => {
    const { values, history } = setup()
    history.recordHistory('title')
    values.title = 'b'
    history.undo()

    history.resetHistory()

    expect(history.canUndo.value).toBe(false)
    expect(history.canRedo.value).toBe(false)
  })
})
