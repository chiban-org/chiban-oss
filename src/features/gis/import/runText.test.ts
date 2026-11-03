import { describe, expect, it } from 'vitest'
import { LAYER_ADAPTERS } from '@/features/gis/exceptionKinds'
import {
  adapterLabel,
  exceptionDetailText,
  exceptionTitle,
  importRunSummary,
  importRunTitle,
  layerLabel,
} from '@/features/gis/import/runText'
import { findIsoDates } from '@/test/leaks'

describe('gis import text', () => {
  it('titles an exception without the internal row key prefix', () => {
    expect(exceptionTitle('owner_changed', 'id:007001000000')).toBe(
      'Owner changed: parcel ID 007001000000',
    )
    expect(exceptionTitle('missing_required_field', 'line:12')).toBe(
      'Required field is empty: line 12',
    )
    expect(exceptionTitle('invalid_geometry', 'src:abc')).toBe(
      'Shape is not valid: source feature abc',
    )
  })

  it('names every adapter and layer in words', () => {
    for (const a of LAYER_ADAPTERS) {
      expect(adapterLabel(a)).not.toContain('_')
      expect(adapterLabel(a)).not.toBe(a)
    }
    expect(adapterLabel('file_cama_csv')).toBe('CAMA CSV file')
    expect(layerLabel('cama')).toBe('CAMA owner data')
    expect(layerLabel('parcels')).toBe('Parcels')
  })

  it('titles a run with its layer and town-zone start time and summarizes the rest', () => {
    const run = {
      layerKey: 'parcels',
      adapter: 'file_shapefile',
      startedAt: new Date('2026-11-02T15:30:00Z'),
      status: 'completed_with_errors',
    }
    const title = importRunTitle(run, 'America/New_York')
    expect(title).toBe('Parcels import, November 2, 2026, 10:30 AM')
    expect(findIsoDates(title)).toEqual([])
    expect(importRunSummary(run)).toBe('From Shapefile. Status: Completed with errors.')
  })

  it('writes the first-seen time in the town zone', () => {
    const text = exceptionDetailText(
      'Missing owner',
      new Date('2026-11-03T02:30:00Z'),
      'America/New_York',
    )
    expect(text).toBe('Missing owner. First seen November 2, 2026, 9:30 PM.')
  })
})
