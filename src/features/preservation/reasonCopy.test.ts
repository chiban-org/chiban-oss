import { describe, expect, it } from 'vitest'
import { preservationReasonLabel } from '@/features/preservation/reasonCopy'

describe('preservationReasonLabel', () => {
  it('maps every known reason key to a sentence without underscores', () => {
    for (const key of [
      'conversion_failed',
      'validation_failed',
      'timeout',
      'ocr_conversion_failed',
      'ocr_timeout',
    ]) {
      const label = preservationReasonLabel(key)
      expect(label).not.toContain('_')
      expect(label.length).toBeGreaterThan(10)
    }
  })

  it('falls back to a generic sentence for an unknown or missing key', () => {
    expect(preservationReasonLabel('weird_new_reason')).toBe('The archival copy could not be made.')
    expect(preservationReasonLabel(null)).toBe('The archival copy could not be made.')
  })
})
