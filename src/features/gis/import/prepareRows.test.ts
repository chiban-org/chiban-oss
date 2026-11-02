import { describe, expect, it } from 'vitest'
import { prepareRows } from '@/features/gis/import/prepareRows'
import type { SourceFeature } from '@/features/gis/import/types'
import type { LayerMapping } from '@/features/gis/layerMapping'
import type { IdFormat } from '@/features/parcels/idFormats'

const formats = new Map<string, IdFormat>([
  ['gis12', { key: 'gis12', kind: 'digits', width: 12 }],
  ['cama15', { key: 'cama15', kind: 'digits', width: 15 }],
])

function mapping(padNumeric = false): LayerMapping {
  return {
    primaryId: { field: 'MAPLOT', format: 'gis12', padNumeric },
    extraIds: [{ field: 'CAMA', format: 'cama15', padNumeric: false }],
    siteAddress: { fields: ['NUM', 'STREET'] },
    ownerName: 'OWNER',
  }
}

const poly: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
}

function feature(props: SourceFeature['properties'], rowRef = '0'): SourceFeature {
  return { rowRef, properties: props, geometry: poly }
}

describe('prepareRows', () => {
  it('numeric id without padNumeric is excepted', () => {
    const [row] = prepareRows([feature({ MAPLOT: 7014000000 })], mapping(), formats)
    expect(row?.failure?.kind).toBe('id_numeric_lost_zeros')
  })

  it('numeric id with padNumeric becomes a padded string', () => {
    const [row] = prepareRows([feature({ MAPLOT: 7014000000 })], mapping(true), formats)
    expect(row?.failure).toBeNull()
    expect(row?.primary).toEqual({ format: 'gis12', value: '007014000000' })
  })

  it('missing primary id is missing_required_field', () => {
    const [row] = prepareRows([feature({ MAPLOT: null })], mapping(), formats)
    expect(row?.failure?.kind).toBe('missing_required_field')
  })

  it('wrong width is id_format_mismatch', () => {
    const [row] = prepareRows([feature({ MAPLOT: '7014' })], mapping(), formats)
    expect(row?.failure?.kind).toBe('id_format_mismatch')
  })

  it('two features with one id merge into one row', () => {
    const rows = prepareRows(
      [feature({ MAPLOT: '007014000000' }, '0'), feature({ MAPLOT: '007014000000' }, '1')],
      mapping(),
      formats,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.geometries).toHaveLength(2)
    expect(rows[0]?.rowRefs).toEqual(['0', '1'])
  })

  it('joins address fields and keeps an absent owner null', () => {
    const [row] = prepareRows(
      [feature({ MAPLOT: '007014000000', NUM: 12, STREET: 'Heron Cove Road', OWNER: '  ' })],
      mapping(),
      formats,
    )
    expect(row?.siteAddress).toBe('12 Heron Cove Road')
    expect(row?.ownerName).toBeNull()
  })

  it('extra ids are collected and blanks skipped', () => {
    const [row] = prepareRows(
      [feature({ MAPLOT: '007014000000', CAMA: '007014000000001' })],
      mapping(),
      formats,
    )
    expect(row?.extras).toEqual([{ format: 'cama15', value: '007014000000001' }])
  })
})
