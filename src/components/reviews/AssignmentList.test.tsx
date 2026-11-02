// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AssignmentList } from '@/components/reviews/AssignmentList'

afterEach(cleanup)

describe('AssignmentList', () => {
  it('shows each review status as a label, not a key', () => {
    render(
      <AssignmentList
        assignments={[
          { assignmentId: 'a1', number: 'BP-2026-0001', status: 'pending' },
          { assignmentId: 'a2', number: 'BP-2026-0002', status: 'signed_off' },
        ]}
      />,
    )
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Signed off')).toBeTruthy()
    expect(screen.queryByText('pending')).toBeNull()
    expect(screen.queryByText('signed off')).toBeNull()
  })
})
