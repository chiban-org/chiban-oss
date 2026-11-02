// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StarterDiffReview } from '@/components/config/StarterDiffReview'

afterEach(cleanup)

describe('StarterDiffReview', () => {
  it('diff review lists the changed fee rate with the member name and dollar values', () => {
    const { container } = render(
      <StarterDiffReview
        members={[
          {
            kind: 'fee_schedule',
            key: 'bp-fees',
            label: 'Building permit fees',
            entries: [{ path: '/lines/0/expr/of/cents', town: 5000, upstream: 4500 }],
          },
        ]}
      />,
    )
    expect(screen.getByText(/Building permit fees/)).not.toBeNull()
    expect(screen.getByText('Lines, item 1, expr, of, amount')).not.toBeNull()
    expect(screen.getByText('Your town: $50.00')).not.toBeNull()
    expect(screen.getByText('Upstream: $45.00')).not.toBeNull()
    expect(container.textContent).not.toContain('bp-fees')
    expect(container.textContent).not.toContain('/lines/')
    const box = screen.getByRole<HTMLInputElement>('checkbox')
    expect(box.name).toBe('path:fee_schedule:bp-fees')
    expect(box.value).toBe('/lines/0/expr/of/cents')
  })
})
