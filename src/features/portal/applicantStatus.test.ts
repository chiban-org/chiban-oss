import { describe, expect, it } from 'vitest'
import {
  type ApplicantStatusInput,
  applicantStatus,
  missingNow,
} from '@/features/portal/applicantStatus'
import type { CivilDate } from '@/types/civilDate'

function input(overrides: Partial<ApplicantStatusInput>): ApplicantStatusInput {
  return {
    state: 'submitted',
    board: false,
    dueCents: 0,
    missingDocuments: [],
    decisionDue: null,
    decisionLate: false,
    canRequestInspection: false,
    ...overrides,
  }
}

describe('applicantStatus', () => {
  it('asks a draft for its missing documents first, then for the submit', () => {
    const missing = applicantStatus(input({ state: 'draft', missingDocuments: ['Plot plan'] }))
    expect(missing.sentence).toBe('Not sent to the town yet.')
    expect(missing.now).toEqual({
      task: 'Add the missing documents',
      note: 'Still needed before you submit: Plot plan.',
      action: 'documents',
    })
    expect(applicantStatus(input({ state: 'draft' })).now).toEqual({
      task: 'Check your answers and submit',
      note: null,
      action: 'submit',
    })
  })

  it('names the fee due on an approved permit as the one thing to do', () => {
    const status = applicantStatus(input({ state: 'decided', dueCents: 71000 }))
    expect(status.sentence).toBe('Approved. Pay $710.00 to have the permit issued.')
    expect(status.now).toEqual({ task: 'Pay $710.00', note: null, action: 'pay' })
  })

  it('says who is waiting and states a decision date only when a clock sets one', () => {
    expect(applicantStatus(input({ state: 'under_review' })).sentence).toBe(
      'Waiting on the town to review it.',
    )
    const dated = applicantStatus(
      input({ state: 'submitted', decisionDue: '2026-12-01' as CivilDate }),
    )
    expect(dated.sentence).toBe(
      "Waiting on the town to review it. The town's decision is due December 1, 2026.",
    )
    expect(dated.now).toBeNull()
  })

  it('speaks of the board for a board application', () => {
    expect(applicantStatus(input({ state: 'under_review', board: true })).sentence).toBe(
      'Waiting on the board. Hearing and decision dates appear below once they are set.',
    )
    expect(applicantStatus(input({ state: 'decided', board: true })).sentence).toBe(
      'Approved by the board.',
    )
  })

  it('offers an inspection request on an issued permit that has inspections', () => {
    const status = applicantStatus(input({ state: 'issued', canRequestInspection: true }))
    expect(status.sentence).toBe('Issued. Request an inspection when the work is ready for one.')
    expect(status.now?.action).toBe('inspect')
  })

  it('shows Pay on a denied record only when a balance is still owed, and says why', () => {
    expect(applicantStatus(input({ state: 'denied' }))).toEqual({
      sentence: 'Denied.',
      now: null,
    })
    const owed = applicantStatus(input({ state: 'denied', dueCents: 5000 }))
    expect(owed.sentence).toBe('Denied. $50.00 in fees charged before the decision is still owed.')
    expect(owed.now?.action).toBe('pay')
  })

  it('reads a withdrawn record as its outcome only', () => {
    expect(applicantStatus(input({ state: 'withdrawn' }))).toEqual({
      sentence: 'Withdrawn.',
      now: null,
    })
  })

  it('asks for a document still missing after the application was sent', () => {
    const status = applicantStatus(
      input({ state: 'under_review', missingDocuments: ['State septic approval'] }),
    )
    expect(status.now).toEqual({
      task: 'Add the missing documents',
      note: 'Still needed: State septic approval.',
      action: 'documents',
    })
  })
})

describe('missingNow', () => {
  const rows = [
    { label: 'Plot plan', stage: 'to_file', status: 'missing', open: true },
    { label: 'Septic approval', stage: 'before_issue', status: 'missing', open: true },
    { label: 'Deed', stage: 'to_file', status: 'provided', open: true },
  ] as const

  it('asks a draft only for what must come with the filing', () => {
    expect(missingNow(rows, 'draft')).toEqual(['Plot plan'])
  })

  it('asks an approved permit for what must come before it is issued', () => {
    expect(missingNow(rows, 'decided')).toEqual(['Septic approval'])
  })
})
