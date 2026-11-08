import { describe, expect, it } from 'vitest'
import { currentTakeStep, takeStepLinks } from '@/features/counter/intake/intakeSteps'

const base = { payTiming: 'at_intake' as const, dueCents: 0, requested: undefined }

describe('currentTakeStep', () => {
  it('opens a draft on the form unless another draft step is asked for', () => {
    expect(currentTakeStep({ ...base, state: 'draft' })).toBe('form')
    expect(currentTakeStep({ ...base, state: 'draft', requested: 'documents' })).toBe('documents')
    expect(currentTakeStep({ ...base, state: 'draft', requested: 'done' })).toBe('form')
  })

  it('asks for the fee after submitting when an intake fee is still due', () => {
    expect(currentTakeStep({ ...base, state: 'submitted', dueCents: 15000 })).toBe('fee')
  })

  it('lets the clerk finish without taking the fee', () => {
    expect(
      currentTakeStep({ ...base, state: 'submitted', dueCents: 15000, requested: 'done' }),
    ).toBe('done')
  })

  it('skips the fee for a type paid at approval', () => {
    expect(
      currentTakeStep({ ...base, payTiming: 'at_approval', state: 'submitted', dueCents: 500 }),
    ).toBe('done')
  })

  it('says a discarded application was withdrawn', () => {
    expect(currentTakeStep({ ...base, state: 'withdrawn' })).toBe('withdrawn')
  })
})

describe('takeStepLinks', () => {
  it('lists the fee step only for a type paid at intake', () => {
    expect(takeStepLinks('at_intake').map((s) => s.key)).toContain('fee')
    expect(takeStepLinks('at_approval').map((s) => s.key)).not.toContain('fee')
  })
})
