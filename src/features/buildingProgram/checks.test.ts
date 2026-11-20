import { describe, expect, it } from 'vitest'
import { buildingProgramIssues } from '@/features/buildingProgram/checks'
import { XX_PACK } from '@/test/packs/xx'

describe('buildingProgramIssues', () => {
  it('rejects a code the pack does not offer', () => {
    expect(
      buildingProgramIssues(
        { key: 'default', permitsEnabled: true, codeChoice: 'other', residents: null },
        XX_PACK.buildingCodes,
      ),
    ).toEqual(['codeChoice: not a code this state allows'])
  })

  it('requires the mandated code above the resident threshold', () => {
    expect(
      buildingProgramIssues(
        { key: 'default', permitsEnabled: true, codeChoice: 'xx.code.a', residents: 4001 },
        XX_PACK.buildingCodes,
      ),
    ).toEqual(['codeChoice: towns over 4000 residents must enforce Vellmora Code B'])
  })

  it('allows no code at or below the threshold', () => {
    expect(
      buildingProgramIssues(
        { key: 'default', permitsEnabled: true, codeChoice: null, residents: 4000 },
        XX_PACK.buildingCodes,
      ),
    ).toEqual([])
  })

  it('accepts the mandated code above the threshold', () => {
    expect(
      buildingProgramIssues(
        { key: 'default', permitsEnabled: true, codeChoice: 'xx.code.b', residents: 9000 },
        XX_PACK.buildingCodes,
      ),
    ).toEqual([])
  })
})
