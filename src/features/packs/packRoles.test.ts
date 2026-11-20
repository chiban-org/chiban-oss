import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import { describe, expect, it } from 'vitest'
import { PackManifestSchema } from '@/features/packs/schema'
import { XX_PACK_MANIFEST } from '@/test/packs/xx/manifest'
import { XX_NO_BUILDING } from '@/test/packs/xx/variants'

function issuesOf(manifest: unknown): string[] {
  const parsed = PackManifestSchema.safeParse(manifest)
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

describe('pack roles', () => {
  it('accepts the nh and fictional manifests', () => {
    expect(issuesOf(NH_PACK_MANIFEST)).toEqual([])
    expect(issuesOf(XX_PACK_MANIFEST)).toEqual([])
  })

  it('rejects a rule role that names no rule', () => {
    const roles = XX_PACK_MANIFEST.roles
    const broken = {
      ...XX_PACK_MANIFEST,
      roles: { ...roles, rules: { ...roles.rules, zbaExercise: 'xx.zba.nope' } },
    }
    expect(issuesOf(broken)).toContain('role rules.zbaExercise names unknown rule xx.zba.nope')
  })

  it('rejects a classification role that names no classification', () => {
    const roles = XX_PACK_MANIFEST.roles
    const classifications = { ...roles.classifications, enforcement: ['xx.nope'] }
    const broken = { ...XX_PACK_MANIFEST, roles: { ...roles, classifications } }
    expect(issuesOf(broken)).toContain(
      'role classifications.enforcement names unknown classification xx.nope',
    )
  })

  it('rejects a record series role that names no series', () => {
    const roles = XX_PACK_MANIFEST.roles
    const recordSeries = { ...roles.recordSeries, complaintLog: 'xx.rs.nope' }
    const broken = { ...XX_PACK_MANIFEST, roles: { ...roles, recordSeries } }
    expect(issuesOf(broken)).toContain(
      'role recordSeries.complaintLog names unknown series xx.rs.nope',
    )
  })

  it('rejects a rule group entry that matches no rule', () => {
    const roles = XX_PACK_MANIFEST.roles
    const ruleGroups = { ...roles.ruleGroups, board: ['xx.pb.'] }
    const broken = { ...XX_PACK_MANIFEST, roles: { ...roles, ruleGroups } }
    expect(issuesOf(broken)).toContain('role ruleGroups.board entry xx.pb. matches no rule')
  })

  it('requires the list age rule when the list freshness gate is named', () => {
    const roles = XX_PACK_MANIFEST.roles
    const broken = {
      ...XX_PACK_MANIFEST,
      roles: { ...roles, gates: { abutterListFresh: 'xx.gate' } },
    }
    expect(issuesOf(broken)).toContain('role gates.abutterListFresh needs rules.abutterListAge')
  })

  it('rejects a missing required role', () => {
    const roles = XX_PACK_MANIFEST.roles
    const broken = {
      ...XX_PACK_MANIFEST,
      roles: { ...roles, rules: { ...roles.rules, rtkResponse: null } },
    }
    expect(issuesOf(broken).length).toBeGreaterThan(0)
  })

  it('accepts a pack with no building permit roles', () => {
    expect(issuesOf(XX_NO_BUILDING.manifest)).toEqual([])
    expect(PackManifestSchema.safeParse(XX_NO_BUILDING.manifest).success).toBe(true)
  })
})
