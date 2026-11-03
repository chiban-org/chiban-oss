import { describe, expect, it } from 'vitest'
import { readRunView, sortRuns } from '@/features/gis/import/runSort'

const RUNS = [
  {
    id: 'a',
    startedAt: new Date('2027-01-02T00:00:00Z'),
    layerKey: 'roads',
    adapter: 'file_shapefile',
    status: 'failed',
  },
  {
    id: 'b',
    startedAt: new Date('2027-01-03T00:00:00Z'),
    layerKey: 'cama',
    adapter: 'file_cama_csv',
    status: 'succeeded',
  },
  {
    id: 'c',
    startedAt: new Date('2027-01-01T00:00:00Z'),
    layerKey: 'parcels',
    adapter: 'axisgis',
    status: 'succeeded',
  },
  {
    id: 'd',
    startedAt: new Date('2027-01-04T00:00:00Z'),
    layerKey: 'parcels',
    adapter: 'esri_rest',
    status: 'running',
  },
]
const ids = (key: Parameters<typeof sortRuns>[1]['key'], dir: 'asc' | 'desc') =>
  sortRuns(RUNS, { key, dir }).map((r) => r.id)

describe('import run sorting', () => {
  it('opens newest first', () => {
    expect(readRunView({}).sort).toEqual({ key: 'started', dir: 'desc' })
    expect(ids('started', 'desc')).toEqual(['d', 'b', 'a', 'c'])
    expect(ids('started', 'asc')).toEqual(['c', 'a', 'b', 'd'])
  })

  it('sorts by the layer name shown, keeping list order inside a tie', () => {
    expect(ids('layer', 'asc')).toEqual(['b', 'c', 'd', 'a'])
  })

  it('sorts by the source name shown rather than its key', () => {
    expect(ids('source', 'asc')).toEqual(['c', 'b', 'd', 'a'])
  })

  it('sorts by status', () => {
    expect(ids('status', 'asc')).toEqual(['a', 'd', 'b', 'c'])
  })
})
