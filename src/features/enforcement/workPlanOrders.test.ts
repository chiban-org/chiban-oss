import { describe, expect, it } from 'vitest'
import { ANSWER_DUE, OPEN_FINDING, planFor, planInput, planOrder } from '@/test/casePlan'
import type { CivilDate } from '@/types/civilDate'

const FILED = { kind: 'filed_with_clerk' as const, occurredOn: '2026-10-20', judgmentOutcome: null }

describe('the case work plan while an order is being served', () => {
  it('asks to serve the unserved tenant with the answer due date', () => {
    const served = planOrder({
      status: { missing: [{ role: 'occupying_tenant', reason: 'unserved' }], servedOn: {} },
      gate: { open: false, blocks: ['service_incomplete', 'answer_period_running'] },
      answerDues: ANSWER_DUE,
    })
    const p = planFor(planInput('order_issued', { findings: OPEN_FINDING, orders: [served] }))
    expect(p.sentence).toBe(
      'Waiting on: Town (Sam Clerk). Serve Robin Renter. Answer due November 20, 2026, 13 days left.',
    )
    expect(p.now?.action).toEqual({ kind: 'record_service', orderId: 'o1', recipientId: 'r2' })
    expect(p.due).toMatchObject({ key: 'answer', date: '2026-11-20', daysLeft: 13 })
    expect(p.groups[0]?.title).toBe('Before the motion to enforce')
    const tenant = p.groups[0]?.rows.find((r) => r.key === 'service:occupying_tenant')
    expect(tenant).toMatchObject({ label: 'Service on the occupying tenant', done: false })
    expect(tenant?.detail).toBe('Not served: Robin Renter.')
    expect(p.groups[0]?.rows.map((r) => r.key)).not.toContain('service:owner_agent')
  })

  it('asks for the check on a role nobody has checked', () => {
    const unchecked = planOrder({
      status: { missing: [{ role: 'occupying_tenant', reason: 'no_check' }], servedOn: {} },
      gate: { open: false, blocks: ['service_incomplete'] },
    })
    const p = planFor(planInput('order_issued', { orders: [unchecked] }))
    expect(p.now?.task).toBe('Record the check for the occupying tenant')
    expect(p.now?.action).toEqual({
      kind: 'record_role_check',
      orderId: 'o1',
      role: 'occupying_tenant',
    })
  })

  it('asks to list a role that has no one listed', () => {
    const unlisted = planOrder({
      status: { missing: [{ role: 'record_owner', reason: 'unserved' }], servedOn: {} },
      service: { recipients: [] },
      gate: { open: false, blocks: ['service_incomplete'] },
    })
    const p = planFor(planInput('order_issued', { orders: [unlisted] }))
    expect(p.now?.task).toBe('List the owner of record')
    expect(p.now?.action).toEqual({ kind: 'list_recipient', orderId: 'o1', role: 'record_owner' })
  })

  it('asks to finish posting and publication when the owner was not found', () => {
    const lost = planOrder({
      status: {
        missing: [{ role: 'record_owner', reason: 'publication_incomplete' }],
        servedOn: {},
      },
      gate: { open: false, blocks: ['service_incomplete'] },
    })
    const p = planFor(planInput('order_issued', { orders: [lost] }))
    expect(p.now?.task).toBe('Finish posting and publication for the owner of record')
    expect(p.now?.action).toEqual({ kind: 'record_service', orderId: 'o1', recipientId: null })
  })

  it('asks to file a fully served order with the court clerk', () => {
    const p = planFor(planInput('order_issued', { orders: [planOrder()] }))
    expect(p.sentence).toBe(
      'Waiting on: Town (Sam Clerk). File order CD-2026-0001 with the court clerk. Corrective action due December 13, 2026, 36 days left.',
    )
    expect(p.now?.action).toEqual({
      kind: 'record_court_step',
      orderId: 'o1',
      step: 'filed_with_clerk',
    })
  })

  it('waits on the ZBA while an appeal stays the case and warns with the stay', () => {
    const banner = 'Enforcement stayed by appeal to the ZBA filed October 30, 2026 (RSA 676:6).'
    const stayedOrder = planOrder({
      gate: { open: false, blocks: ['stayed', 'not_filed_with_clerk'] },
    })
    const p = planFor(
      planInput('order_issued', {
        stay: { stayed: true, reason: 'appeal_pending' },
        banner,
        orders: [stayedOrder],
      }),
    )
    expect(p.sentence).toBe('Waiting on: Zoning Board of Adjustment. Decide the appeal.')
    expect(p.now?.action).toBeNull()
    expect(p.now?.warnings).toEqual([{ key: 'stay', text: banner }])
    expect(p.stayed).toBe(true)
    expect(p.due).toBeNull()
    expect(p.groups[0]?.rows.find((r) => r.key === 'stay')).toMatchObject({ done: false })
  })
})

describe('the case work plan in court', () => {
  it('waits on the respondent while the answer period runs', () => {
    const running = planOrder({
      steps: [FILED],
      gate: { open: false, blocks: ['answer_period_running'] },
      answerDues: ANSWER_DUE,
    })
    const p = planFor(planInput('in_court', { orders: [running] }))
    expect(p.sentence).toBe(
      'Waiting on: Respondent (Larkspur Family Trust). Answer the order. Answer due November 20, 2026, 13 days left.',
    )
    expect(p.now).toMatchObject({ action: null, actor: 'respondent', task: 'Wait for the answer' })
  })

  it('waits on the five days after filing with the clerk', () => {
    const lead = planOrder({
      steps: [FILED],
      gate: { open: false, blocks: [{ filingLeadUntil: '2026-11-10' as CivilDate }] },
    })
    const p = planFor(planInput('in_court', { orders: [lead] }))
    expect(p.now?.task).toBe('File the motion to enforce on or after November 10, 2026')
    expect(p.now?.action).toBeNull()
  })

  it('asks for the motion when the gate is open', () => {
    const p = planFor(
      planInput('in_court', { orders: [planOrder({ steps: [FILED], gate: { open: true } })] }),
    )
    expect(p.now?.task).toBe('File the motion to enforce')
    expect(p.now?.action).toEqual({
      kind: 'record_court_step',
      orderId: 'o1',
      step: 'motion_to_enforce',
    })
  })

  it('sends an answered order to town counsel', () => {
    const answered = planOrder({ steps: [FILED], gate: { open: false, blocks: ['answered'] } })
    const p = planFor(planInput('in_court', { orders: [answered] }))
    expect(p.sentence).toBe(
      'Waiting on: Town (Sam Clerk). Refer the case to town counsel. Corrective action due December 13, 2026, 36 days left.',
    )
    expect(p.now?.action).toBeNull()
    const referred = planFor(
      planInput('in_court', { orders: [answered], referrals: [{ outcomes: [] }] }),
    )
    expect(referred.sentence).toBe(
      'Waiting on: Town counsel. Take the answered order to court. Corrective action due December 13, 2026, 36 days left.',
    )
  })

  it('waits on the court after the motion is filed', () => {
    const motion = planOrder(
      {
        steps: [
          FILED,
          { kind: 'motion_to_enforce', occurredOn: '2026-10-27', judgmentOutcome: null },
        ],
        gate: { open: true },
      },
      { status: 'motion_filed' },
    )
    const p = planFor(planInput('in_court', { orders: [motion] }))
    expect(p.sentence).toBe(
      'Waiting on: Court. Rule on the motion to enforce. Corrective action due December 13, 2026, 36 days left.',
    )
    expect(p.now?.task).toBe('Record the judgment')
    expect(p.now?.action).toEqual({ kind: 'record_court_step', orderId: 'o1', step: 'judgment' })
    expect(p.groups[0]?.title).toBe('Before the case is resolved')
  })

  const judged = planOrder(
    {
      steps: [
        FILED,
        { kind: 'motion_to_enforce', occurredOn: '2026-10-27', judgmentOutcome: null },
        { kind: 'judgment', occurredOn: '2026-10-30', judgmentOutcome: 'affirmed' },
      ],
      gate: { open: true },
      appealDue: { due: '2026-11-29' as CivilDate },
    },
    { status: 'judgment' },
  )

  it('asks to collect a fine balance after judgment', () => {
    const p = planFor(
      planInput('in_court', { orders: [judged], fines: [{ row: { id: 'f1' }, dueCents: 7500 }] }),
    )
    expect(p.sentence).toBe(
      'Waiting on: Town (Sam Clerk). Collect the $75.00 fine balance. Appeal of the judgment due November 29, 2026, 22 days left.',
    )
    expect(p.now?.action).toEqual({ kind: 'record_fine_payment', fineId: 'f1' })
  })

  it('asks to resolve once the judgment is in and nothing is owed', () => {
    const p = planFor(
      planInput('in_court', { orders: [judged], fines: [{ row: { id: 'f1' }, dueCents: 0 }] }),
    )
    expect(p.now?.task).toBe('Resolve the case')
    expect(p.now?.action).toEqual({ kind: 'move', to: 'resolved' })
    expect(p.moves).toEqual([])
  })
})
