import { describe, expect, it } from 'vitest'
import { type PlanApproval, planRequestWork, type RequestPlanInput } from '@/features/rtk/workPlan'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const STATED = { due: '2026-11-30' } as unknown as RequestPlanInput['request']['statedDue']

function input(
  patch: Partial<RequestPlanInput['request']>,
  approvals: PlanApproval[] = [],
): RequestPlanInput {
  return {
    request: {
      status: 'open',
      firstResponseKind: null,
      firstResponseOn: null,
      statedDue: null,
      deniedOn: null,
      timeliness: { kind: 'running', dueOn: d('2026-11-13'), daysRemaining: 5 },
      current: { kind: 'running', dueOn: d('2026-11-13'), daysRemaining: 5 },
      withholdings: 0,
      ...patch,
    },
    approvals,
  }
}

const pending: PlanApproval = { releasedIn: null, revoked: false, redacted: false, cited: true }

describe('request status sentence', () => {
  it('names the first response and its days left while the clock runs', () => {
    expect(planRequestWork(input({})).sentence).toBe(
      'Waiting on: Town. Send the first response. First response due November 13, 2026, 5 days left.',
    )
  })

  it('says now and counts the days overdue once the first response is late', () => {
    const late = input({
      current: { kind: 'overdue', dueOn: d('2026-10-30'), daysOverdue: 9 },
    })
    expect(planRequestWork(late).sentence).toBe(
      'Waiting on: Town. Send the first response now. First response due October 30, 2026, 9 days overdue.',
    )
  })

  it('reads today on the due date itself and warns in the card', () => {
    const plan = planRequestWork(input({ current: { kind: 'due_today', dueOn: d('2026-11-08') } }))
    expect(plan.sentence).toBe(
      'Waiting on: Town. Send the first response. First response due November 8, 2026, today.',
    )
    expect(plan.now?.warnings.map((w) => w.text)).toEqual(['The first response is due today.'])
  })

  it('names the date the town stated while a decision is waiting', () => {
    const waiting = input({
      status: 'awaiting_decision',
      firstResponseKind: 'time_statement',
      firstResponseOn: d('2026-11-03'),
      statedDue: STATED,
      current: { kind: 'running', dueOn: d('2026-11-30'), daysRemaining: 22 },
    })
    expect(planRequestWork(waiting).sentence).toBe(
      'Waiting on: Town. Release the records or deny the request. Date the town stated: November 30, 2026, 22 days left.',
    )
    expect(planRequestWork(waiting).now?.kind).toBe('release')
  })

  it('asks to release approved records before closing a responded request', () => {
    const plan = planRequestWork(
      input({ status: 'responded', firstResponseOn: d('2026-11-03'), current: null }, [pending]),
    )
    expect(plan.sentence).toBe(
      'Waiting on: Town. Release the approved records, then close the request.',
    )
    expect(plan.now?.kind).toBe('release')
  })

  it('asks only to close a responded request with nothing pending', () => {
    const released: PlanApproval = { ...pending, releasedIn: 1 }
    const revoked: PlanApproval = { ...pending, revoked: true }
    const plan = planRequestWork(
      input({ status: 'responded', firstResponseOn: d('2026-11-03'), current: null }, [
        released,
        revoked,
      ]),
    )
    expect(plan.sentence).toBe('Waiting on: Town. Close the request.')
    expect(plan.now?.kind).toBe('close')
    expect(plan.due).toBeNull()
  })

  it('reads only the outcome once closed or withdrawn, with no card', () => {
    const closed = planRequestWork(input({ status: 'closed', current: null }))
    expect(closed.sentence).toBe('This request is closed.')
    expect(closed.now).toBeNull()
    const withdrawn = planRequestWork(input({ status: 'withdrawn', current: null }))
    expect(withdrawn.sentence).toBe('The requester withdrew this request.')
    expect(withdrawn.now).toBeNull()
  })
})

describe('request card warnings', () => {
  it('warns when the first response is late', () => {
    const late = input({ current: { kind: 'overdue', dueOn: d('2026-10-30'), daysOverdue: 9 } })
    expect(planRequestWork(late).now?.warnings.map((w) => w.text)).toEqual([
      'The first response is late. It was due October 30, 2026.',
    ])
  })

  it('does not warn while days are left', () => {
    expect(planRequestWork(input({})).now?.warnings).toEqual([])
  })
})

describe('request requirements', () => {
  const titles = (plan: ReturnType<typeof planRequestWork>) =>
    plan.groups.map((g) => `${g.title}: ${g.items.map((i) => `${i.label}=${i.done}`).join(', ')}`)

  it('an open request lists the first response, the denial rule and the release rules', () => {
    expect(titles(planRequestWork(input({})))).toEqual([
      'First response: First response sent=false',
      'Before a denial: A withheld record with its exemption and explanation=false',
      'Before records are released: Each version approved for this request=false, Each redacted copy has its exemptions drawn=true',
    ])
  })

  it('marks a late first response with its dates and an uncited redacted copy as not done', () => {
    const plan = planRequestWork(
      input(
        {
          status: 'awaiting_decision',
          firstResponseKind: 'time_statement',
          firstResponseOn: d('2026-11-03'),
          statedDue: STATED,
          withholdings: 1,
          timeliness: {
            kind: 'responded_late',
            dueOn: d('2026-11-01'),
            respondedOn: d('2026-11-03'),
          },
        },
        [{ ...pending, redacted: true, cited: false }],
      ),
    )
    const first = plan.groups[0]?.items[0]
    expect(first?.done).toBe(true)
    expect(first?.detail).toBe('Sent late: due November 1, 2026, sent November 3, 2026.')
    expect(titles(plan).slice(1)).toEqual([
      'Before a denial: A withheld record with its exemption and explanation=true',
      'Before records are released: Each version approved for this request=true, Each redacted copy has its exemptions drawn=false',
    ])
  })

  it('a closed request keeps only the first response group', () => {
    const plan = planRequestWork(
      input({
        status: 'closed',
        firstResponseOn: d('2026-11-03'),
        current: null,
        timeliness: {
          kind: 'responded_on_time',
          dueOn: d('2026-11-09'),
          respondedOn: d('2026-11-03'),
        },
      }),
    )
    expect(titles(plan)).toEqual(['First response: First response sent=true'])
    expect(plan.groups[0]?.items[0]?.detail).toBe('Sent on time, November 3, 2026.')
  })
})
