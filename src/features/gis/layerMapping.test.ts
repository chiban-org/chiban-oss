import { describe, expect, it } from 'vitest'
import { layerMappingSchema } from '@/features/gis/layerMapping'

describe('layerMappingSchema', () => {
  it('mapping rejects an id field with no format', () => {
    const r = layerMappingSchema.safeParse({ primaryId: { field: 'MAPLOT' } })
    expect(r.success).toBe(false)
  })

  it('padNumeric defaults to false', () => {
    const r = layerMappingSchema.parse({ primaryId: { field: 'MAPLOT', format: 'gis12' } })
    expect(r.primaryId.padNumeric).toBe(false)
    expect(r.extraIds).toEqual([])
  })
})
