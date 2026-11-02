import { describe, expect, it } from 'vitest'
import { releaseFilename } from '@/features/rtk/releaseFilename'

describe('releaseFilename', () => {
  it('names the file after the document title with the stored extension, not the stored name', () => {
    expect(releaseFilename('Minutes of October 14', 'a2ffbcdd.pdf')).toBe(
      'Minutes of October 14.pdf',
    )
  })

  it('drops characters that do not belong in a file name', () => {
    expect(releaseFilename('Letter: owner / agent "draft"', 'x.PNG')).toBe(
      'Letter owner agent draft.png',
    )
  })

  it('keeps the stored name when the title has nothing usable', () => {
    expect(releaseFilename('///', 'owner-letter.pdf')).toBe('owner-letter.pdf')
  })

  it('does not repeat an extension the title already ends with', () => {
    expect(releaseFilename('letter.pdf', 'stored.pdf')).toBe('letter.pdf')
  })

  it('adds no extension when the stored name has none', () => {
    expect(releaseFilename('Site plan', 'scan')).toBe('Site plan')
  })
})
