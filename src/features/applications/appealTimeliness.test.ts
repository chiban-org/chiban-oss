import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { describe, expect, it } from 'vitest'
import { lateAppealWarning } from '@/features/applications/appealTimeliness'
import { planWork } from '@/features/applications/workPlan'
import { withPackForTest } from '@/features/packs/registry'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

function formOf(pack: typeof ME_PACK, starterId: string) {
  const starter = pack.starters.find((s) => s.id === starterId)
  if (starter === undefined) throw new Error(`no starter ${starterId}`)
  return starter.form
}

describe('a late administrative appeal', () => {
  const form = formOf(ME_PACK, 'me.starter.boa_admin_appeal')

  it('warns when the appeal is filed after the window closed', () => {
    const warning = withPackForTest(ME_PACK, () =>
      lateAppealWarning({
        form,
        values: { decision_date: '2026-10-01' },
        receivedDate: d('2026-11-22'),
      }),
    )
    expect(warning).toBe('Filed after the appeal window closed on November 2, 2026.')
  })

  it('says nothing when the appeal is filed inside the window', () => {
    const warning = withPackForTest(ME_PACK, () =>
      lateAppealWarning({
        form,
        values: { decision_date: '2026-10-01' },
        receivedDate: d('2026-10-20'),
      }),
    )
    expect(warning).toBeNull()
  })

  it('uses the town length when one is set', () => {
    const warning = withPackForTest(ME_PACK, () =>
      lateAppealWarning({
        form,
        values: { decision_date: '2026-10-01' },
        receivedDate: d('2026-10-20'),
        length: { unit: 'days', value: 14 },
      }),
    )
    expect(warning).toBe('Filed after the appeal window closed on October 15, 2026.')
  })

  it('says nothing without a decision date or a received date', () => {
    withPackForTest(ME_PACK, () => {
      expect(lateAppealWarning({ form, values: {}, receivedDate: d('2026-11-22') })).toBeNull()
      expect(
        lateAppealWarning({ form, values: { decision_date: '2026-10-01' }, receivedDate: null }),
      ).toBeNull()
    })
  })

  it('warns a New Hampshire administrative appeal too', () => {
    const warning = withPackForTest(NH_PACK, () =>
      lateAppealWarning({
        form: formOf(NH_PACK, 'nh.starter.zba_administrative_appeal'),
        values: { decision_date: '2026-10-01' },
        receivedDate: d('2026-11-22'),
      }),
    )
    expect(warning).toMatch(/^Filed after the appeal window closed on /)
  })
})

describe('the late filing warning in the work plan', () => {
  it('shows on the card and starts nothing', () => {
    const text = 'Filed after the appeal window closed on November 2, 2026.'
    const plan = planWork(
      {
        state: 'submitted',
        isBuildingPermit: false,
        classification: null,
        completedDate: null,
        nextTransitions: ['under_review', 'withdrawn'],
        allowedMoves: ['under_review', 'withdrawn'],
        gates: [{ to: 'under_review', results: [] }],
        gatesAhead: [],
        allowsDirectIssue: false,
        clocks: [],
        regionalImpact: { applies: false, determination: null, notices: [] },
      },
      null,
      { reviewers: 0, abilities: new Set(), responsible: null, lateAppeal: text },
    )
    expect(plan.now?.warnings).toEqual([{ key: 'appeal.late', text }])
  })
})
