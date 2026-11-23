import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { describe, expect, it } from 'vitest'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { withPackForTest } from '@/features/packs/registry'
import { caseStageInput } from './caseStageInput'
import { caseStages } from './stageStrip'
import type { CaseWorkPlan } from './workPlanTypes'

const PLAN = { status: 'resolved', stayed: false, due: null } as Pick<
  CaseWorkPlan,
  'status' | 'stayed' | 'due'
>

function detailWith(court: {
  outcomes?: string[]
  civilActions?: number
}): Pick<CaseDetail, 'findings' | 'orders' | 'referrals' | 'remedies'> {
  return {
    findings: [{ id: 'f1', status: 'corrected' }],
    orders: [],
    referrals: [{ row: {}, outcomes: (court.outcomes ?? []).map((kind) => ({ kind })) }],
    remedies: {
      holdOffered: false,
      civilOffered: true,
      holds: [],
      permits: [],
      civilActions: Array.from({ length: court.civilActions ?? 0 }, () => ({})),
    },
  } as unknown as Pick<CaseDetail, 'findings' | 'orders' | 'referrals' | 'remedies'>
}

function labels(detail: ReturnType<typeof detailWith>): string[] {
  return caseStages(caseStageInput(detail, PLAN)).map((s) => s.label)
}

describe('the stage strip of a resolved case with no order', () => {
  it('keeps In court once counsel recorded a court outcome', () => {
    withPackForTest(ME_PACK, () => {
      expect(labels(detailWith({ outcomes: ['judgment_for_town'] }))).toContain('In court')
    })
  })

  it('keeps In court once a civil action was filed', () => {
    withPackForTest(ME_PACK, () => {
      expect(labels(detailWith({ civilActions: 1 }))).toContain('In court')
    })
  })

  it('leaves In court out when nothing went to court', () => {
    withPackForTest(ME_PACK, () => {
      expect(labels(detailWith({ outcomes: ['settled'] }))).not.toContain('In court')
    })
  })

  it('reads only order court steps where an order is possible', () => {
    withPackForTest(NH_PACK, () => {
      expect(labels(detailWith({ outcomes: ['judgment_for_town'] }))).not.toContain('In court')
    })
  })
})
