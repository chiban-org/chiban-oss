import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { compileFolderPattern, parseFolder } from '@/features/migration/folderPattern'

const SOURCE = String.raw`^Map (?<map>\d+)/Lot (?<lot>\d+)(?:-(?<sub>\d+))?`
function pattern(): RegExp {
  const compiled = compileFolderPattern(SOURCE)
  if (compiled === null) throw new Error('fixture pattern did not compile')
  return compiled
}

const PARTS = [
  { column: 'map', width: 3 },
  { column: 'lot', width: 3 },
  { column: 'sub', width: 3 },
  { literal: '000' },
]

describe('compileFolderPattern', () => {
  it('rejects text that is not a regular expression', () => {
    expect(compileFolderPattern('Map (')).toBeNull()
  })

  it('rejects a pattern without named groups', () => {
    expect(compileFolderPattern('^Map \\d+')).toBeNull()
  })
})

describe('parseFolder', () => {
  it('Map 7/Lot 14 composes 007014000000', () => {
    expect(parseFolder('Map 7/Lot 14', pattern(), PARTS)).toBe('007014000000')
  })

  it('a sub lot in the folder name fills the sub part', () => {
    expect(parseFolder('Map 7/Lot 14-2', pattern(), PARTS)).toBe('007014002000')
  })

  it('files below the lot folder still belong to the lot', () => {
    expect(parseFolder('Map 7/Lot 14/Septic', pattern(), PARTS)).toBe('007014000000')
  })

  it('a folder named Misc is unparseable', () => {
    expect(parseFolder('Misc', pattern(), PARTS)).toBeNull()
  })

  it('files at the root of the source have no folder to parse', () => {
    expect(parseFolder('', pattern(), PARTS)).toBeNull()
  })

  it('a number wider than its part is unparseable', () => {
    expect(parseFolder('Map 7777/Lot 14', pattern(), PARTS)).toBeNull()
  })

  it('the default CAMA parts give a fifteen digit id', () => {
    expect(parseFolder('Map 7/Lot 14', pattern(), DEFAULT_CAMA_MAPPING.id.parts)).toBe(
      '007014000000000',
    )
  })
})
