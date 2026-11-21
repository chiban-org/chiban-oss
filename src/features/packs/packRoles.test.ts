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

  it('rejects a deemed_refused clock that is not an action_due clock', () => {
    const rules = XX_PACK_MANIFEST.rules.map((r) =>
      r.key === 'xx.bp.decision' && r.kind === 'clock'
        ? {
            ...r,
            clockType: 'filing_window' as const,
            consequence: { kind: 'deemed_refused' as const, text: 'Silence is a refusal.' },
          }
        : r,
    )
    expect(issuesOf({ ...XX_PACK_MANIFEST, rules })).toContain(
      'clock xx.bp.decision is deemed_refused and must be an action_due clock',
    )
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
      roles: { ...roles, gates: { ...roles.gates, abutterListFresh: 'xx.gate' } },
    }
    expect(issuesOf(broken)).toContain('role gates.abutterListFresh needs rules.abutterListAge')
  })

  it('rejects a variance gate role that names no rule', () => {
    const roles = XX_PACK_MANIFEST.roles
    const broken = {
      ...XX_PACK_MANIFEST,
      roles: { ...roles, gates: { ...roles.gates, varianceRecorded: 'xx.gate.nope' } },
    }
    expect(issuesOf(broken)).toContain(
      'role gates.varianceRecorded names unknown rule xx.gate.nope',
    )
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

  function withBadClock(length: unknown, overridePolicy: unknown): unknown {
    const bad = {
      ...XX_PACK_MANIFEST.rules[0],
      key: 'xx.bad',
      length,
      overridePolicy,
    }
    return { ...XX_PACK_MANIFEST, rules: [...XX_PACK_MANIFEST.rules, bad] }
  }

  it('rejects a clock with delegated_choice and no fromSetting length', () => {
    const broken = withBadClock(
      { unit: 'days', value: 30 },
      { policy: 'delegated_choice', default: 30 },
    )
    expect(issuesOf(broken)).toContain(
      'clock xx.bad uses delegated_choice; read a town_setting through length.fromSetting',
    )
  })

  it('rejects fromSetting naming a rule that is not a town_setting', () => {
    const broken = withBadClock(
      { unit: 'days', fromSetting: 'xx.bp.decision' },
      { policy: 'delegated_choice', default: 30 },
    )
    expect(issuesOf(broken)).toContain(
      'clock xx.bad fromSetting xx.bp.decision is not a town_setting',
    )
  })

  function withReceiptRule(clock: Record<string, unknown>, rule: Record<string, unknown> = {}) {
    const lead = {
      ...XX_PACK_MANIFEST.rules.find((r) => r.key === 'xx.bp.decision'),
      key: 'xx.receipt.lead',
      clockType: 'notice_lead',
      startEvent: 'application_received',
      direction: 'after',
      consequence: { kind: 'notice_defective', text: 'Notice later than this is defective.' },
      length: { unit: 'days', value: 7 },
      overridePolicy: { policy: 'fixed' },
      ...clock,
    }
    const notice = {
      ...XX_PACK_MANIFEST.rules.find((r) => r.key === 'xx.zba.notice.mail'),
      key: 'xx.receipt.notice',
      leadRuleKey: 'xx.receipt.lead',
      stage: 'on_receipt',
      ...rule,
    }
    return { ...XX_PACK_MANIFEST, rules: [...XX_PACK_MANIFEST.rules, lead, notice] }
  }

  it('defaults a notice requirement to before_hearing', () => {
    const parsed = PackManifestSchema.parse(XX_PACK_MANIFEST)
    const notice = parsed.rules.find((r) => r.key === 'xx.zba.notice.mail')
    expect(notice?.kind === 'notice_requirement' && notice.stage).toBe('before_hearing')
  })

  it('accepts an on_receipt requirement led by an after clock started at receipt', () => {
    expect(issuesOf(withReceiptRule({}))).toEqual([])
  })

  it('rejects an on_receipt requirement whose lead clock counts before', () => {
    expect(issuesOf(withReceiptRule({ direction: 'before' }))).toContain(
      'notice_requirement xx.receipt.notice is on_receipt and its lead clock xx.receipt.lead must count after application_received',
    )
  })

  it('rejects an on_receipt requirement whose lead clock starts at another event', () => {
    expect(issuesOf(withReceiptRule({ startEvent: 'acceptance_meeting_set' }))).toContain(
      'notice_requirement xx.receipt.notice is on_receipt and its lead clock xx.receipt.lead must count after application_received',
    )
  })

  it('rejects an on_receipt requirement whose lead rule is not a clock', () => {
    expect(issuesOf(withReceiptRule({}, { leadRuleKey: 'xx.nope' }))).toContain(
      'notice_requirement xx.receipt.notice is on_receipt and its lead clock xx.nope must count after application_received',
    )
  })

  it('accepts the receipt recipient roles and the source water condition', () => {
    const manifest = withReceiptRule(
      {},
      {
        recipients: {
          roles: [
            'abutter_owner',
            'municipal_clerk',
            'municipal_reviewing_authority',
            'water_supplier',
          ],
        },
        onlyWhen: 'source_water_area',
      },
    )
    expect(issuesOf(manifest)).toEqual([])
  })
})
