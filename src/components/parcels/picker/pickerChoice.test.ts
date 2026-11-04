import { describe, expect, it } from 'vitest'
import { optionsFor } from '@/components/parcels/picker/pickerChoice'

describe('optionsFor', () => {
  it('offers a typed ID anyway only as one ID the lineage form will not split', () => {
    expect(optionsFor([], '007020001000', true)).toEqual([{ kind: 'raw', value: '007020001000' }])
    expect(optionsFor([], '007020001000 007020002000', true)).toEqual([])
    expect(optionsFor([], '007020001000,007020002000', true)).toEqual([])
  })
})
