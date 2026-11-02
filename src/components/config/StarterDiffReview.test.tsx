// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StarterDiffReview } from '@/components/config/StarterDiffReview'

afterEach(cleanup)

describe('StarterDiffReview', () => {
  it('diff review lists the changed fee rate path with town and upstream values', () => {
    render(
      <StarterDiffReview
        members={[
          {
            kind: 'fee_schedule',
            key: 'bp-fees',
            entries: [{ path: '/lines/0/expr/of/of/of/0/centsPerUnit', town: 50, upstream: 35 }],
          },
        ]}
      />,
    )
    expect(screen.getByText('/lines/0/expr/of/of/of/0/centsPerUnit')).not.toBeNull()
    expect(screen.getByText(/Your town: 50/)).not.toBeNull()
    expect(screen.getByText(/Upstream: 35/)).not.toBeNull()
    const box = screen.getByRole<HTMLInputElement>('checkbox')
    expect(box.name).toBe('path:fee_schedule:bp-fees')
    expect(box.value).toBe('/lines/0/expr/of/of/of/0/centsPerUnit')
  })
})
