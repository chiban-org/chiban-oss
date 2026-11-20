import { NH_PACK } from '@packs/nh'
import { describe, expect, it } from 'vitest'
import { buildingCodeIssues } from '@/features/packs/buildingCodeChecks'
import { packById } from '@/features/packs/registry'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'

const codes = XX_PACK.buildingCodes

describe('buildingCodeIssues', () => {
  it('passes the New Hampshire and fictional packs', () => {
    expect(buildingCodeIssues(NH_PACK.buildingCodes)).toEqual([])
    expect(buildingCodeIssues(XX_PACK.buildingCodes)).toEqual([])
    expect(packById('nh')).toBe(NH_PACK)
  })

  it('rejects a default choice that is not among the choices', () => {
    const pack = xxPackWith({ pack: { buildingCodes: { ...codes, defaultChoice: 'xx.code.z' } } })
    expect(buildingCodeIssues(pack.buildingCodes)).toEqual([
      'buildingCodes.defaultChoice: xx.code.z is not one of the choices',
    ])
  })

  it('rejects a required code that is not among the choices', () => {
    const pack = xxPackWith({
      pack: {
        buildingCodes: { ...codes, requiredAbove: { residents: 4000, choice: 'xx.code.z' } },
      },
    })
    expect(buildingCodeIssues(pack.buildingCodes)).toEqual([
      'buildingCodes.requiredAbove.choice: xx.code.z is not one of the choices',
    ])
  })

  it('allows a pack with no default and no required code', () => {
    const pack = xxPackWith({
      pack: { buildingCodes: { ...codes, defaultChoice: null, requiredAbove: null } },
    })
    expect(buildingCodeIssues(pack.buildingCodes)).toEqual([])
  })
})
