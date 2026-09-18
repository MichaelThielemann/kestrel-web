import { describe, expect, it } from 'vitest'
import './editor'
import './list'
import './media'
import './system'
import './shared'
import { defineUiStep, registeredUiStepNames } from './define'
import { uiStepNames } from './step-names'

describe('uiStepNames registry', () => {
  it('registers only names contained in uiStepNames', () => {
    for (const name of registeredUiStepNames) {
      expect(uiStepNames).toContain(name)
    }
  })

  it('registers every declared uiStepNames entry from at least one action module', () => {
    for (const name of uiStepNames) {
      expect(registeredUiStepNames.has(name)).toBe(true)
    }
  })
})

describe('defineUiStep', () => {
  it('rejects a misspelled step name at compile time', () => {
    function attemptTypo(): void {
      // @ts-expect-error "guard.unsavd" is not a member of uiStepNames
      defineUiStep('guard.unsavd', () => {})
    }
    expect(typeof attemptTypo).toBe('function')
  })
})
