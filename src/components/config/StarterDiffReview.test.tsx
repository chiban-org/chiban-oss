// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StarterDiffReview } from '@/components/config/StarterDiffReview'

afterEach(cleanup)

describe('StarterDiffReview', () => {
  it('diff review lists the changed fee rate with the member name and dollar values', () => {
    const { container } = render(
      <form>
        <StarterDiffReview
          members={[
            {
              kind: 'fee_schedule',
              key: 'bp-fees',
              label: 'Building permit fees',
              entries: [{ path: '/lines/0/expr/of/cents', town: 5000, upstream: 4500 }],
            },
          ]}
        />
      </form>,
    )
    expect(screen.getByText(/Building permit fees/)).not.toBeNull()
    expect(screen.getByText('Lines, item 1, expr, of, amount')).not.toBeNull()
    expect(screen.getByText('Your town: $50.00')).not.toBeNull()
    expect(screen.getByText('Upstream: $45.00')).not.toBeNull()
    expect(container.textContent).not.toContain('bp-fees')
    expect(container.textContent).not.toContain('/lines/')
    fireEvent.click(screen.getByRole('checkbox'))
    const form = container.querySelector('form') as HTMLFormElement
    expect(Array.from(new FormData(form).entries())).toEqual([
      ['path:fee_schedule:bp-fees', '/lines/0/expr/of/cents'],
    ])
  })
})
