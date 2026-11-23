// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortalApplicationView } from '@/features/portal/portalView'

vi.mock('./endingActions', () => ({
  deleteDraftAction: vi.fn(),
  withdrawApplicationAction: vi.fn(),
}))
vi.mock('@/components/ActionForm', () => ({
  ActionForm: ({ confirm }: { confirm: { title: string; body: string } }) => (
    <div>
      <p>{confirm.title}</p>
      <p>{confirm.body}</p>
    </div>
  ),
}))

const { EndingActions } = await import('./EndingPanel')

afterEach(cleanup)

function viewOf(dueCents: number): PortalApplicationView {
  return {
    applicationId: 'app-1',
    state: 'under_review',
    record: { mayEnd: true, rowVersion: 3 },
    fees: { lines: [], dueCents, pendingAttempts: 0, unknownAttempts: 0 },
  } as unknown as PortalApplicationView
}

describe('EndingActions', () => {
  it('warns on withdrawal that fees already charged are still owed', () => {
    render(<EndingActions view={viewOf(12500)} />)
    expect(
      screen.getByText(
        'The town stops reviewing it. This cannot be undone. Fees of $125.00 already charged are still owed.',
      ),
    ).toBeTruthy()
  })

  it('says nothing about fees when none are owed', () => {
    render(<EndingActions view={viewOf(0)} />)
    expect(screen.getByText('The town stops reviewing it. This cannot be undone.')).toBeTruthy()
  })
})
