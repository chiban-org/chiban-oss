import { describe, expect, it } from 'vitest'
import { NEUTRAL_PACK_TEXT } from '@/features/packs/neutralPackText'
import { fieldGroups } from '@/features/templates/kinds/fieldGroups'
import { SIGNER_ROLES } from '@/features/town/profileSchema'
import { signerRoleChoices } from '@/features/town/signerRoleChoices'

const WITHOUT_PLUMBING = SIGNER_ROLES.filter((role) => role !== 'plumbing_inspector')

function fieldNames(roles: readonly (typeof SIGNER_ROLES)[number][]): string[] {
  return fieldGroups('permit', NEUTRAL_PACK_TEXT.vocabulary, roles).flatMap((g) =>
    g.fields.map((f) => f.name),
  )
}

describe('letter builder signers by pack', () => {
  it('offers no plumbing inspector merge fields when the pack has no plumbing inspector', () => {
    const names = fieldNames(WITHOUT_PLUMBING)
    expect(names).not.toContain('signer.plumbing_inspector.name')
    expect(names).not.toContain('signer.plumbing_inspector.title')
    expect(names).toContain('signer.building_official.name')
  })

  it('offers them when the pack has one', () => {
    expect(fieldNames(SIGNER_ROLES)).toContain('signer.plumbing_inspector.name')
  })

  it('offers no plumbing inspector to sign unless the block already names one', () => {
    expect(signerRoleChoices(WITHOUT_PLUMBING, 'building_official')).not.toContain(
      'plumbing_inspector',
    )
    expect(signerRoleChoices(WITHOUT_PLUMBING, 'plumbing_inspector')).toContain(
      'plumbing_inspector',
    )
    expect(signerRoleChoices(SIGNER_ROLES, 'town_clerk')).toEqual([...SIGNER_ROLES])
  })
})
