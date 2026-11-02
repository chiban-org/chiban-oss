import { describe, expect, it } from 'vitest'
import { buildMapStyle } from '@/components/map/mapStyle'
import { TOKENS } from '@/features/design/tokens'

const base = {
  tokens: TOKENS,
  basemapRasterUrl: null,
  basemapAttribution: null,
  layers: [] as ('roads' | 'water')[],
}

function urls(style: object): string[] {
  return JSON.stringify(style).match(/https?:\/\/[^"]+/g) ?? []
}

describe('buildMapStyle', () => {
  it('style has no basemap source when url is null', () => {
    const style = buildMapStyle(base)
    expect(Object.keys(style.sources)).toEqual(['parcels'])
    const background = style.layers.find((l) => l.type === 'background')
    expect(background?.paint).toMatchObject({ 'background-color': TOKENS.canvas })
  })

  it('style contains no http url except the configured basemap', () => {
    expect(urls(buildMapStyle({ ...base, layers: ['roads', 'water'] }))).toEqual([])
    const withBasemap = buildMapStyle({
      ...base,
      basemapRasterUrl: 'https://tiles.alderpond.example/{z}/{x}/{y}.png',
      basemapAttribution: 'Alder Pond tiles',
    })
    expect(urls(withBasemap)).toEqual(['https://tiles.alderpond.example/{z}/{x}/{y}.png'])
    expect(Object.keys(withBasemap.sources)).toContain('basemap')
  })

  it('has no remote glyphs or sprite', () => {
    const style = buildMapStyle(base)
    expect(style.glyphs).toBeUndefined()
    expect(style.sprite).toBeUndefined()
  })

  it('selected parcel paint uses TOKENS action', () => {
    const style = buildMapStyle({ ...base, selectedParcelId: 'abc' })
    const selected = style.layers.find((l) => l.id === 'parcel-selected-line')
    expect(selected?.paint).toMatchObject({ 'line-color': TOKENS.action })
    expect(selected && 'filter' in selected ? selected.filter : null).toEqual([
      '==',
      ['get', 'parcel_id'],
      'abc',
    ])
  })

  it('includes road and water layers only when requested', () => {
    const ids = (layers: ('roads' | 'water')[]) =>
      buildMapStyle({ ...base, layers }).layers.map((l) => l.id)
    expect(ids([])).not.toContain('roads-line')
    expect(ids(['roads'])).toContain('roads-line')
    expect(ids(['water'])).toContain('water-fill')
  })

  it('prefixes tile urls with the tile base', () => {
    const style = buildMapStyle({ ...base, tileBase: 'https://alderpond.example' })
    expect(JSON.stringify(style)).toContain(
      'https://alderpond.example/api/tiles/parcels/{z}/{x}/{y}',
    )
  })
})
