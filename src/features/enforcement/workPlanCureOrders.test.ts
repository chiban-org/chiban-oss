import { describe, expect, it } from 'vitest'
import { OPEN_FINDING, planFor, planInput, planOrder } from '@/test/casePlan'
import type { CivilDate } from '@/types/civilDate'
import type { CureNoticeFact } from './cureStanding'

const RULE = { label: 'Cure procedure', remedies: { developmentHold: false, civilAction: false } }
const NOTICE: CureNoticeFact = {
  findingIds: ['f1'],
  due: '2026-11-10' as CivilDate,
  returnReceiptOn: null,
}
const LAPSED = '2026-11-11' as CivilDate
const DRAFT = planOrder({}, { status: 'draft', issuedOn: null })

function underCure(today: CivilDate, notices = [NOTICE], orders: (typeof DRAFT)[] = []) {
  return planInput('violation_found', {
    today,
    findings: OPEN_FINDING,
    orders,
    cure: { rule: RULE, notices },
  })
}

function rowsOf(p: ReturnType<typeof planFor>) {
  return new Map(p.groups.flatMap((g) => g.rows).map((r) => [r.key, r.done]))
}

describe('orders on a case under a cure procedure', () => {
  it('counts a sent cure notice as the notice of violation before the order', () => {
    const rows = rowsOf(planFor(underCure('2026-11-07' as CivilDate)))
    expect(rows.get('notice.sent')).toBe(true)
    expect(rows.get('notice.received')).toBe(false)
  })

  it('counts a cure notice return receipt as receipt of the notice', () => {
    const received = { ...NOTICE, returnReceiptOn: '2026-11-03' }
    const rows = rowsOf(planFor(underCure('2026-11-07' as CivilDate, [received])))
    expect(rows.get('notice.received')).toBe(true)
  })

  it('leaves the notice row open while no cure notice is sent', () => {
    const rows = rowsOf(planFor(underCure('2026-11-07' as CivilDate, [])))
    expect(rows.get('notice.sent')).toBe(false)
  })

  it('offers to draft an order once the cure period ran', () => {
    const p = planFor(underCure(LAPSED))
    expect(p.remedies).toEqual([{ kind: 'draft_order' }])
    expect(p.now?.action).toEqual({ kind: 'draft_order' })
  })

  it('does not offer an order while the cure period runs', () => {
    expect(planFor(underCure('2026-11-07' as CivilDate)).remedies).toEqual([])
  })

  it('asks to issue a draft once the cure period ran and offers no second draft', () => {
    const p = planFor(underCure(LAPSED, [NOTICE], [DRAFT]))
    expect(p.now?.action).toEqual({ kind: 'issue_order', orderId: 'o1' })
    expect(p.remedies).toEqual([])
  })
})
