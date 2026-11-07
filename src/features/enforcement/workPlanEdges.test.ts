import { describe, expect, it } from 'vitest'
import { planFor, planInput, planOrder } from '@/test/casePlan'
import type { CivilDate } from '@/types/civilDate'

const FILED = { kind: 'filed_with_clerk' as const, occurredOn: '2026-09-20', judgmentOutcome: null }
const MOTION = {
  kind: 'motion_to_enforce' as const,
  occurredOn: '2026-10-20',
  judgmentOutcome: null,
}

describe('the case work plan across orders, owners and counsel', () => {
  it('works the outstanding order when an earlier order already has a judgment', () => {
    const judged = planOrder(
      {
        steps: [
          FILED,
          MOTION,
          { kind: 'judgment', occurredOn: '2026-10-30', judgmentOutcome: 'affirmed' },
        ],
        gate: { open: true },
      },
      { status: 'judgment' },
    )
    const unserved = planOrder(
      {
        status: { missing: [{ role: 'occupying_tenant', reason: 'unserved' }], servedOn: {} },
        gate: { open: false, blocks: ['service_incomplete'] },
      },
      { id: 'o2', number: 'CD-2026-0002' },
    )
    const p = planFor(planInput('in_court', { orders: [judged, unserved] }))
    expect(p.now?.task).toBe('Serve Robin Renter')
    expect(p.now?.action).toEqual({ kind: 'record_service', orderId: 'o2', recipientId: 'r2' })
  })

  it('serves a listed owner agent for the owner gap instead of asking to list an owner', () => {
    const agent = planOrder({
      status: { missing: [{ role: 'record_owner', reason: 'unserved' }], servedOn: {} },
      service: { recipients: [{ id: 'a1', role: 'owner_agent', name: 'Alex Agent' }] },
      gate: { open: false, blocks: ['service_incomplete'] },
    })
    const p = planFor(planInput('order_issued', { orders: [agent] }))
    expect(p.now?.task).toBe('Serve Alex Agent')
    expect(p.now?.action).toEqual({ kind: 'record_service', orderId: 'o1', recipientId: 'a1' })
    const owner = p.groups[0]?.rows.find((r) => r.key === 'service:record_owner')
    expect(owner?.detail).toBe('Not served: Alex Agent.')
  })

  it('keeps the judgment appeal due of an annulled order', () => {
    const annulled = planOrder(
      {
        steps: [
          FILED,
          MOTION,
          { kind: 'judgment', occurredOn: '2026-11-06', judgmentOutcome: 'annulled' },
        ],
        appealDue: { due: '2026-11-21' as CivilDate },
      },
      { status: 'annulled' },
    )
    const p = planFor(planInput('in_court', { orders: [annulled] }))
    expect(p.due).toMatchObject({ key: 'judgment_appeal', date: '2026-11-21', daysLeft: 14 })
  })

  const answered = planOrder({ steps: [FILED], gate: { open: false, blocks: ['answered'] } })

  it('collects the fine once counsel wins a judgment for the town', () => {
    const p = planFor(
      planInput('in_court', {
        orders: [answered],
        referrals: [{ outcomes: [{ kind: 'judgment_for_town' }] }],
        fines: [{ row: { id: 'f1' }, dueCents: 7500 }],
      }),
    )
    expect(p.now?.action).toEqual({ kind: 'record_fine_payment', fineId: 'f1' })
  })

  it('asks to resolve once counsel proceedings end without a judgment for the town', () => {
    const p = planFor(
      planInput('in_court', {
        orders: [answered],
        referrals: [{ outcomes: [{ kind: 'motion_filed' }, { kind: 'dismissed' }] }],
      }),
    )
    expect(p.now?.action).toEqual({ kind: 'move', to: 'resolved' })
  })

  it('keeps waiting on counsel while proceedings are open', () => {
    const p = planFor(
      planInput('in_court', {
        orders: [answered],
        referrals: [{ outcomes: [{ kind: 'motion_filed' }] }],
      }),
    )
    expect(p.now?.actor).toBe('counsel')
  })

  it('issues an outstanding draft before the issued order goes to court', () => {
    const issued = planOrder()
    const draft = planOrder(
      {},
      { id: 'o2', number: 'CD-2026-0002', status: 'draft', issuedOn: null },
    )
    const p = planFor(planInput('order_issued', { orders: [issued, draft] }))
    expect(p.now?.action).toEqual({ kind: 'issue_order', orderId: 'o2' })
  })

  it('keeps waiting on counsel while any referral is still open', () => {
    const open = planFor(
      planInput('in_court', {
        orders: [answered],
        referrals: [
          { outcomes: [{ kind: 'dismissed' }] },
          { outcomes: [{ kind: 'motion_filed' }] },
        ],
      }),
    )
    expect(open.now?.actor).toBe('counsel')
    const appealed = planFor(
      planInput('in_court', {
        orders: [answered],
        referrals: [
          { outcomes: [{ kind: 'judgment_for_town' }, { kind: 'appealed_to_superior_court' }] },
        ],
      }),
    )
    expect(appealed.now?.actor).toBe('counsel')
  })

  it('takes the soonest running answer across the active orders', () => {
    const first = planOrder({ gate: { open: false, blocks: ['not_filed_with_clerk'] } })
    const second = planOrder(
      {
        answerDues: [
          { name: 'Robin Renter', due: { due: '2026-11-20' as CivilDate }, answeredOn: null },
        ],
      },
      { id: 'o2', number: 'CD-2026-0002' },
    )
    const p = planFor(planInput('order_issued', { orders: [first, second] }))
    expect(p.due).toMatchObject({ key: 'answer', date: '2026-11-20' })
  })

  it('lists counsel requirements for an answered order once it is referred', () => {
    const p = planFor(
      planInput('in_court', {
        orders: [answered],
        referrals: [{ outcomes: [{ kind: 'judgment_for_town' }] }],
        fines: [{ row: { id: 'f1' }, dueCents: 7500 }],
      }),
    )
    expect(p.groups[0]?.title).toBe('Before the case is resolved')
    expect(p.groups[0]?.rows.map((r) => [r.label, r.done])).toEqual([
      ['Referred to town counsel', true],
      ['Counsel proceedings decided', true],
      ['Fines paid', false],
    ])
  })
})
