import { describe, it, expect } from 'vitest'
import { siteTitleTemplate } from './site-title'

describe('siteTitleTemplate', () => {
  it('joins page and site title with the default separator', () => {
    expect(siteTitleTemplate('Example Site')('Startseite')).toBe('Startseite · Example Site')
  })

  it('uses a configured separator and normalises its spacing', () => {
    expect(siteTitleTemplate('Site', '|')('Page')).toBe('Page | Site')
    expect(siteTitleTemplate('Site', '  /  ')('Page')).toBe('Page / Site')
    expect(siteTitleTemplate('Site', '   ')('Page')).toBe('Page · Site')
  })

  it('puts the site title first when the position is prefix', () => {
    expect(siteTitleTemplate('Site', '|', 'prefix')('Page')).toBe('Site | Page')
    expect(siteTitleTemplate('Site', null, 'suffix')('Page')).toBe('Page · Site')
    expect(siteTitleTemplate('Site', null, 'prefix')('')).toBe('Site')
  })

  it('drops empty parts', () => {
    expect(siteTitleTemplate('Example Site')('')).toBe('Example Site')
    expect(siteTitleTemplate(null)('Startseite')).toBe('Startseite')
    expect(siteTitleTemplate(undefined)(null)).toBe('')
  })
})
