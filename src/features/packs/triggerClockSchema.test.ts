import { describe, expect, it } from 'vitest'
import { type ClockRule, PackManifestSchema } from '@/features/packs/schema'
import { XX_TRIGGER_CLOCKS, XX_TRIGGER_RULES } from '@/test/packs/xx/triggerVariants'

const [commencement, hearingBy] = XX_TRIGGER_RULES as [ClockRule, ClockRule]

function withRule(rule: ClockRule) {
  const rules = XX_TRIGGER_CLOCKS.manifest.rules.map((r) => (r.key === rule.key ? rule : r))
  return PackManifestSchema.safeParse({ ...XX_TRIGGER_CLOCKS.manifest, rules })
}

function messages(result: ReturnType<typeof withRule>): string[] {
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe('the pack manifest and clocks met or started by other events', () => {
  it('accepts an inspection-met clock at permit_issued and a hearing-dependent clock at acceptance', () => {
    expect(PackManifestSchema.safeParse(XX_TRIGGER_CLOCKS.manifest).success).toBe(true)
  })

  it('refuses an inspection-met clock that does not start at permit_issued', () => {
    expect(messages(withRule({ ...commencement, startEvent: 'board_vote' }))).toContain(
      'clock xx.bp.commencement is satisfiedByInspection and must start at permit_issued',
    )
  })

  it('refuses a hearing-dependent clock that does not start at application_accepted', () => {
    expect(messages(withRule({ ...hearingBy, startEvent: 'application_received' }))).toContain(
      'clock xx.pb.hearing_by is onlyIfHearingScheduled and must start at application_accepted',
    )
  })
})
