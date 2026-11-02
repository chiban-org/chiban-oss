import { describe, expect, it } from 'vitest'
import { exceptionDetailText, importRunSummary } from '@/features/gis/import/runText'
import { findIsoDates } from '@/test/leaks'

describe('gis import text', () => {
  it('summarizes a run with a town-zone time and a labelled status', () => {
    const text = importRunSummary(
      {
        layerKey: 'parcels',
        adapter: 'shapefile',
        startedAt: new Date('2026-11-02T15:30:00Z'),
        status: 'completed_with_errors',
      },
      'America/New_York',
    )
    expect(text).toBe(
      'parcels from shapefile, started Nov 2, 2026, 10:30 AM. Status: Completed with errors.',
    )
    expect(findIsoDates(text)).toEqual([])
  })

  it('writes the first-seen time in the town zone', () => {
    const text = exceptionDetailText(
      'Missing owner',
      new Date('2026-11-03T02:30:00Z'),
      'America/New_York',
    )
    expect(text).toBe('Missing owner. First seen Nov 2, 2026, 9:30 PM.')
  })
})
