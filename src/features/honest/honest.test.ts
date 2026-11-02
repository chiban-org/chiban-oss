import { describe, expect, it } from 'vitest'
import type { LayerStatus } from '@/features/gis/layerStatus'
import { honestFromLayer } from '@/features/honest/honest'

function status(state: LayerStatus['state']): LayerStatus {
  return {
    key: 'parcels',
    state,
    lastSuccessAt: '2027-01-01T15:00:00.000Z',
    lastFailureAt: '2027-02-01T15:00:00.000Z',
    ageDays: 10,
    staleAfterDays: 90,
  }
}

describe('honestFromLayer', () => {
  it('null owner in a fresh layer is unknown, not empty string', () => {
    expect(honestFromLayer<string>(status('fresh'), null)).toEqual({ state: 'unknown' })
  })

  it('known value in a fresh layer carries its as-of', () => {
    expect(honestFromLayer(status('fresh'), 'Larkspur Family Trust')).toEqual({
      state: 'known',
      value: 'Larkspur Family Trust',
      asOf: '2027-01-01T15:00:00.000Z',
    })
  })

  it('roads with no adapter maps to not_applicable', () => {
    expect(honestFromLayer(status('not_configured'), null)).toEqual({ state: 'not_applicable' })
  })

  it('never imported maps to unknown', () => {
    expect(honestFromLayer(status('never_imported'), null)).toEqual({ state: 'unknown' })
  })

  it('stale keeps the value and the threshold', () => {
    expect(honestFromLayer(status('stale'), 'x')).toMatchObject({
      state: 'stale',
      value: 'x',
      staleAfterDays: 90,
    })
  })

  it('failed import keeps the last value and both times', () => {
    expect(honestFromLayer(status('import_failed'), 'x')).toEqual({
      state: 'import_failed',
      value: 'x',
      lastSuccessAt: '2027-01-01T15:00:00.000Z',
      lastFailureAt: '2027-02-01T15:00:00.000Z',
    })
  })
})
