import { describe, expect, it } from 'vitest'
import { homeGroup, homeNextStep } from '@/features/portal/homeGroups'

const base = { dueCents: 0, failedInspection: false, missingDocuments: [] as string[] }

describe('homeGroup', () => {
  it('puts drafts, fees due and failed inspections under Needs you', () => {
    expect(homeGroup({ ...base, state: 'draft' })).toBe('needs_you')
    expect(homeGroup({ ...base, state: 'decided', dueCents: 100 })).toBe('needs_you')
    expect(homeGroup({ ...base, state: 'issued', failedInspection: true })).toBe('needs_you')
  })

  it('keeps open work in progress and endings finished, unless money is still owed', () => {
    expect(homeGroup({ ...base, state: 'under_review' })).toBe('in_progress')
    expect(homeGroup({ ...base, state: 'suspended' })).toBe('in_progress')
    expect(homeGroup({ ...base, state: 'withdrawn' })).toBe('finished')
    expect(homeGroup({ ...base, state: 'denied', dueCents: 500 })).toBe('needs_you')
  })
})

describe('a missing document the applicant owes', () => {
  it('puts a paid, approved application under Needs you and names the document', () => {
    const facts = {
      ...base,
      state: 'decided' as const,
      missingDocuments: ['State septic approval'],
    }
    expect(homeGroup(facts)).toBe('needs_you')
    expect(homeNextStep(facts)).toBe('Add State septic approval.')
  })
})

describe('homeNextStep', () => {
  it('names the one next step in a line', () => {
    expect(homeNextStep({ ...base, state: 'draft' })).toBe('Finish the form and submit it.')
    expect(homeNextStep({ ...base, state: 'decided', dueCents: 71000 })).toBe('Pay $710.00.')
    expect(homeNextStep({ ...base, state: 'issued', failedInspection: true })).toBe(
      'An inspection failed. Request a reinspection when the work is fixed.',
    )
    expect(homeNextStep({ ...base, state: 'submitted' })).toBe('Waiting on the town.')
    expect(homeNextStep({ ...base, state: 'closed' })).toBe('Complete.')
  })
})
