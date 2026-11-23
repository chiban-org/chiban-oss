import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import { keysSatisfiedByCompletion } from '@/features/clocks/ruleEngine'
import { type ClockRule, PackManifestSchema } from '@/features/packs/schema'

const KEY = 'me.ssw.completeness'

function withCompletenessRule(change: Partial<ClockRule>) {
  const rules = ME_PACK.manifest.rules.map((r) =>
    r.key === KEY && r.kind === 'clock' ? { ...r, ...change } : r,
  )
  const parsed = PackManifestSchema.safeParse({ ...ME_PACK.manifest, rules })
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

describe('clocks met when staff mark the application complete', () => {
  it('the Maine wastewater completeness date is one', () => {
    expect(keysSatisfiedByCompletion(ME_PACK.manifest.rules)).toEqual([KEY])
  })

  it('refuses one that does not start at application_received', () => {
    expect(withCompletenessRule({ startEvent: 'permit_issued' })).toContain(
      `clock ${KEY} is satisfiedByCompletion and must start at application_received`,
    )
  })
})
