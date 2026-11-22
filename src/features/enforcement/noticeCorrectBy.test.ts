import { describe, expect, it } from 'vitest'
import { withPackForTest } from '@/features/packs/registry'
import { OPEN_FINDING, PLAN_TODAY, planFor, planInput } from '@/test/casePlan'
import { XX_NO_ORDERS } from '@/test/packs/xx/noOrders'

const TOMORROW = '2026-11-08'
const YESTERDAY = '2026-11-06'

function noticed(correctBy: string | null) {
  return planInput('violation_found', {
    findings: OPEN_FINDING,
    notices: [{ id: 'n1', receivedOn: '2026-11-02', correctBy }],
  })
}

describe('a notice of violation with a correct-by date', () => {
  it('waits for the correction date before counsel when the date is tomorrow', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(noticed(TOMORROW))
      expect(PLAN_TODAY).toBe('2026-11-07')
      expect(plan.now).toMatchObject({
        key: 'notice.correct_by',
        task: 'Wait for the correction date, November 8, 2026',
        actor: 'respondent',
        action: null,
      })
    })
  })

  it('moves on to counsel once the correction date has passed', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(noticed(YESTERDAY))
      expect(plan.now?.key).toBe('counsel.referred')
      expect(plan.now?.task).toBe('Refer the case to town counsel')
    })
  })

  it('moves on to counsel when the notice has no correction date', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(noticed(null))
      expect(plan.now?.key).toBe('counsel.referred')
    })
  })

  it('reads the latest notice for the correction date', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(
        planInput('violation_found', {
          findings: OPEN_FINDING,
          notices: [
            { id: 'n1', receivedOn: '2026-11-02', correctBy: YESTERDAY },
            { id: 'n2', receivedOn: '2026-11-03', correctBy: TOMORROW },
          ],
        }),
      )
      expect(plan.now?.key).toBe('notice.correct_by')
    })
  })

  it('keeps waiting for an earlier notice date when a later notice has none', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(
        planInput('violation_found', {
          findings: OPEN_FINDING,
          notices: [
            { id: 'n1', receivedOn: '2026-11-02', correctBy: TOMORROW },
            { id: 'n2', receivedOn: '2026-11-03', correctBy: null },
          ],
        }),
      )
      expect(plan.now).toMatchObject({
        key: 'notice.correct_by',
        task: 'Wait for the correction date, November 8, 2026',
      })
    })
  })

  it('waits for the latest date when a later notice sets an earlier one', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(
        planInput('violation_found', {
          findings: OPEN_FINDING,
          notices: [
            { id: 'n1', receivedOn: '2026-11-02', correctBy: '2026-11-20' },
            { id: 'n2', receivedOn: '2026-11-03', correctBy: TOMORROW },
          ],
        }),
      )
      expect(plan.now?.task).toBe('Wait for the correction date, November 20, 2026')
    })
  })
})
