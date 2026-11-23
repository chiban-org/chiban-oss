import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { describe, expect, it } from 'vitest'
import { packText } from '@/features/packs/packText'
import { withPackForTest } from '@/features/packs/registry'

describe('pack signer roles', () => {
  it('offers the plumbing inspector only where the pack has one', () => {
    expect(withPackForTest(NH_PACK, () => packText().signerRoles)).not.toContain(
      'plumbing_inspector',
    )
    expect(withPackForTest(ME_PACK, () => packText().signerRoles)).toContain('plumbing_inspector')
    expect(withPackForTest(NH_PACK, () => packText().signerRoles)).toContain('building_official')
  })
})
