// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FeeTable } from '@/components/fees/FeeTable'
import type { FeeComputation } from '@/features/fees/computeFees'

afterEach(cleanup)

const WAIVED: FeeComputation = {
  complete: true,
  totalCents: 0,
  lines: [
    {
      code: 'building',
      label: 'Building permit fee',
      due: 'at_approval',
      amount: {
        value: 0,
        source: 'manual_override',
        replaced: { value: 45000, source: 'town_setting' },
      },
      explanation: ['finished_sq_ft at 35 cents per unit', 'Waived'],
    },
  ],
}

describe('FeeTable', () => {
  it('shows "Waived (was $450.00)" for a waived line', () => {
    render(<FeeTable title="At approval" computation={WAIVED} />)
    expect(screen.getByText('Waived (was $450.00)')).toBeTruthy()
    expect(screen.getByText('Building permit fee')).toBeTruthy()
  })

  it('shows a set amount with the computed amount it replaced', () => {
    const set: FeeComputation = {
      ...WAIVED,
      totalCents: 30000,
      lines: [
        {
          ...WAIVED.lines[0],
          amount: {
            value: 30000,
            source: 'manual_override',
            replaced: { value: 45000, source: 'town_setting' },
          },
        } as FeeComputation['lines'][number],
      ],
    }
    render(<FeeTable title="At approval" computation={set} />)
    expect(screen.getByText('$300.00 (was $450.00)')).toBeTruthy()
  })

  it('shows a plain amount, the explanation steps, and the total', () => {
    const plain: FeeComputation = {
      complete: true,
      totalCents: 45000,
      lines: [
        {
          code: 'building',
          label: 'Building permit fee',
          due: 'at_approval',
          amount: { value: 45000, source: 'town_setting', replaced: null },
          explanation: ['finished_sq_ft at 35 cents per unit'],
        },
      ],
    }
    render(<FeeTable title="At approval" computation={plain} />)
    expect(screen.getAllByText('$450.00')).toHaveLength(2)
    expect(screen.getByText('finished_sq_ft at 35 cents per unit')).toBeTruthy()
  })

  it('shows a pending line and an unknown total in words', () => {
    const pending: FeeComputation = {
      complete: false,
      totalCents: null,
      lines: [
        {
          code: 'notice',
          label: 'Abutter notice',
          due: 'at_approval',
          amount: { pending: 'Abutter list not yet issued' },
          explanation: [],
        },
      ],
    }
    render(<FeeTable title="At approval" computation={pending} />)
    expect(screen.getByText('Pending: Abutter list not yet issued')).toBeTruthy()
    expect(screen.getByText('Total not yet known')).toBeTruthy()
  })
})
