import { describe, expect, it } from 'vitest'
import { IMPORT_EXCEPTION_KINDS } from '@/features/gis/exceptionKinds'
import {
  EXCEPTION_KIND_LABELS,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_STATUSES,
  exceptionKindLabel,
} from '@/features/gis/exceptionLabels'

describe('import exception labels', () => {
  it('names every kind and status in plain words', () => {
    for (const kind of IMPORT_EXCEPTION_KINDS) {
      const label = EXCEPTION_KIND_LABELS.get(kind) ?? ''
      expect(label).not.toBe('')
      expect(label).not.toContain('_')
    }
    for (const status of EXCEPTION_STATUSES) {
      expect(EXCEPTION_STATUS_LABELS.get(status) ?? '').toMatch(/^[A-Z][a-z ]+$/)
    }
    expect(exceptionKindLabel('id_numeric_lost_zeros')).toBe('Parcel ID lost its leading zeros')
    expect(EXCEPTION_STATUS_LABELS.get('resolved_by_rerun')).toBe('Cleared by a later import')
  })

  it('falls back to spaced words for a kind it does not know', () => {
    expect(exceptionKindLabel('brand_new_kind')).toBe('Brand new kind')
  })
})
