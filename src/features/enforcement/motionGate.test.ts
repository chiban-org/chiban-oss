import { describe, expect, it } from 'vitest'
import { computeSubjectDue } from '@/features/clocks/subjectDue'
import { motionGate } from '@/features/enforcement/motionGate'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import { NOT_STAYED } from '@/features/enforcement/stay'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const pack = loadPack()
const rule = (() => {
  const found = ruleByKey(pack, 'nh.enf.cd_zoning')
  if (found.kind !== 'cease_and_desist') throw new Error('rule')
  return found
})()
const answerRule = (() => {
  const found = ruleByKey(pack, 'nh.enf.answer_zoning')
  if (found.kind !== 'clock') throw new Error('rule')
  return found
})()
const dueFor = (served: string) =>
  computeSubjectDue(answerRule, d(served), {
    holidays: packHolidayCalendar(),
    packVersion: pack.version,
    citations: PACK_COUNTING_CITATIONS,
  })
const COMPLETE: ServiceStatus = {
  complete: true,
  servedOn: {},
  fallbackCompletedOn: null,
  missing: [],
}

function gate(overrides: Partial<Parameters<typeof motionGate>[0]> = {}) {
  return motionGate({
    rule,
    status: COMPLETE,
    recipients: [{ answerDue: dueFor('2027-03-01'), answeredOn: null }],
    filedWithClerkOn: d('2027-03-10'),
    stay: NOT_STAYED,
    today: d('2027-03-23'),
    ...overrides,
  })
}

describe('motionGate', () => {
  it('motion on 2027-03-22 is answer_period_running for service on 2027-03-01', () => {
    expect(gate({ today: d('2027-03-22') })).toEqual({
      open: false,
      blocks: ['answer_period_running'],
    })
  })

  it('motion on 2027-03-23 after clerk filing on 2027-03-10 opens', () => {
    expect(gate()).toEqual({ open: true })
  })

  it('clerk filing on 2027-04-01 holds the motion until 2027-04-06', () => {
    const held = gate({ today: d('2027-04-05'), filedWithClerkOn: d('2027-04-01') })
    expect(held).toEqual({ open: false, blocks: [{ filingLeadUntil: '2027-04-06' }] })
    expect(gate({ today: d('2027-04-06'), filedWithClerkOn: d('2027-04-01') })).toEqual({
      open: true,
    })
  })

  it('a recorded answer blocks the motion as answered', () => {
    const result = gate({
      recipients: [{ answerDue: dueFor('2027-03-01'), answeredOn: d('2027-03-15') }],
    })
    expect(result).toEqual({ open: false, blocks: ['answered'] })
  })

  it('incomplete service blocks with service_incomplete', () => {
    const result = gate({
      status: {
        ...COMPLETE,
        complete: false,
        missing: [{ role: 'mortgagee_of_record', reason: 'unserved' }],
      },
    })
    expect(result.open).toBe(false)
    expect(!result.open && result.blocks).toContain('service_incomplete')
  })

  it('no clerk filing blocks with not_filed_with_clerk', () => {
    expect(gate({ filedWithClerkOn: null })).toEqual({
      open: false,
      blocks: ['not_filed_with_clerk'],
    })
  })

  it('a stay blocks with stayed', () => {
    const result = gate({ stay: { stayed: true, reason: 'appeal_pending', appealId: 'a1' } })
    expect(result).toEqual({ open: false, blocks: ['stayed'] })
  })

  it('the filing lead comes from the pack rule', () => {
    const longer = { ...rule, courtFilingLeadDays: 10 }
    expect(
      gate({ rule: longer, today: d('2027-03-23'), filedWithClerkOn: d('2027-03-18') }),
    ).toEqual({ open: false, blocks: [{ filingLeadUntil: '2027-03-28' }] })
  })

  it('the day after a rolled answer date opens a service made by publication ending 2027-03-25', () => {
    const due = dueFor('2027-03-25')
    expect(due.due).toBe('2027-04-14')
    expect(
      gate({ recipients: [{ answerDue: due, answeredOn: null }], today: d('2027-04-14') }).open,
    ).toBe(false)
    expect(
      gate({ recipients: [{ answerDue: due, answeredOn: null }], today: d('2027-04-15') }).open,
    ).toBe(true)
  })
})
