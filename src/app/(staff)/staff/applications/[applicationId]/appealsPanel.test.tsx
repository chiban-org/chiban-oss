// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'

vi.mock('./buildingActions', () => ({
  recordAppealAction: vi.fn(),
  resolveAppealAction: vi.fn(),
}))

const { AppealsPanel } = await import('./appealsPanel')

afterEach(cleanup)

function view(overrides: Record<string, unknown>): StaffApplicationView {
  return {
    id: 'a1',
    state: 'issued',
    today: '2027-03-20',
    appeals: [],
    acceptsAppeal: true,
    permissions: { canIssue: true, canRecordAppeal: true },
    ...overrides,
  } as unknown as StaffApplicationView
}

function show(v: StaffApplicationView) {
  render(
    <CsrfProvider token="t">
      <AppealsPanel view={v} graph={[]} />
    </CsrfProvider>,
  )
}

describe('the Record an appeal form', () => {
  it('shows on a permit suspended under a hold when an appeal is accepted', () => {
    show(view({ state: 'suspended' }))
    expect(screen.getByText('Record an appeal')).toBeTruthy()
  })

  it('is absent when an appeal would not be accepted', () => {
    show(view({ acceptsAppeal: false }))
    expect(screen.queryByText('Record an appeal')).toBeNull()
  })
})
