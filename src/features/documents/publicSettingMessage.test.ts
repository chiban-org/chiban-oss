import { describe, expect, it } from 'vitest'
import { publicSettingMessage } from '@/features/documents/publicSettingMessage'

describe('publicSettingMessage', () => {
  it('says the approved copy shows on the public site when the tick is on', () => {
    expect(publicSettingMessage({ isPublic: true, heldByPrivateCase: false })).toBe(
      'Saved. The approved copy shows on the public site.',
    )
  })

  it('says it waits for the case when a private enforcement case holds it back', () => {
    expect(publicSettingMessage({ isPublic: true, heldByPrivateCase: true })).toBe(
      'Saved. It shows on the public site once the case is shown there.',
    )
  })

  it('says the document is hidden when the tick is off', () => {
    expect(publicSettingMessage({ isPublic: false, heldByPrivateCase: true })).toBe(
      'Saved. The document is hidden from the public site.',
    )
  })
})
