import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import { withPackForTest } from '@/features/packs/registry'
import { OPEN_FINDING, planFor, planInput } from '@/test/casePlan'

const open = planInput('violation_found', { findings: OPEN_FINDING })

describe('routing an open finding to the cure notice', () => {
  it('points to the cure notice when the pack has a cure procedure and none is chosen', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(open)
      expect(plan.now?.key).toBe('notice.sent')
      expect(plan.now?.note).toBe(
        'If the shoreland cure notice applies, choose it under Cure notice before sending a notice of violation.',
      )
    })
  })

  it('adds no note under a pack with no cure procedure', () => {
    const plan = planFor(open)
    expect(plan.now?.key).toBe('notice.sent')
    expect(plan.now?.note).toBeNull()
  })
})
