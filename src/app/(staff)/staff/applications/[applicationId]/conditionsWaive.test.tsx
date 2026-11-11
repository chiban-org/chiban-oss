// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'

vi.mock('./actions', () => ({}))
vi.mock('./conditionActions', () => ({
  applyConditionAction: () => Promise.resolve({ ok: true, message: '' }),
  setConditionStatusAction: () => Promise.resolve({ ok: true, message: '' }),
}))
vi.mock('./clockFeeActions', () => ({}))

const { ConditionsPanel } = await import('./panels')

afterEach(cleanup)

interface ConditionPatch {
  blocksIssuance?: boolean
  status?: 'unmet' | 'met' | 'waived'
  statusReason?: string | null
}

function renderPanel(
  condition: ConditionPatch,
  permissions: { canIssue: boolean; canOverrideGate: boolean },
) {
  const view = {
    id: 'a1',
    state: 'under_review',
    permissions,
    conditions: [
      {
        id: 'c1',
        code: 'DRIVEWAY',
        textSnapshot: 'Driveway permit on file',
        blocksIssuance: false,
        status: 'unmet',
        statusReason: null,
        ...condition,
      },
    ],
    conditionLibrary: [],
  } as unknown as StaffApplicationView
  render(
    <CsrfProvider token="t">
      <ConditionsPanel view={view} />
    </CsrfProvider>,
  )
}

const STAFF = { canIssue: true, canOverrideGate: false }
const ADMIN = { canIssue: true, canOverrideGate: true }

describe('waiving a condition', () => {
  it('lets staff who issue permits waive a condition that does not block issuance, reason optional', () => {
    renderPanel({}, STAFF)
    expect(screen.getByRole('button', { name: 'Waive condition' })).toBeTruthy()
    const reason = screen.getByLabelText(/Reason for waiving/)
    expect(reason.hasAttribute('required')).toBe(false)
    expect(screen.getByDisplayValue('waived')).toBeTruthy()
  })

  it('asks for a reason when waiving a condition that blocks issuance', () => {
    renderPanel({ blocksIssuance: true }, ADMIN)
    const reason = screen.getByLabelText(/Reason for waiving/)
    expect(reason.hasAttribute('required')).toBe(true)
    expect(reason.getAttribute('minlength')).toBe('10')
  })

  it('does not offer waiving a blocking condition to staff who cannot override gates', () => {
    renderPanel({ blocksIssuance: true }, STAFF)
    expect(screen.queryByRole('button', { name: 'Waive condition' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark met' })).toBeTruthy()
  })

  it('does not offer waiving to staff who cannot issue permits', () => {
    renderPanel({}, { canIssue: false, canOverrideGate: true })
    expect(screen.queryByRole('button', { name: 'Waive condition' })).toBeNull()
  })

  it('shows a waived condition as waived with its reason and no actions', () => {
    renderPanel({ status: 'waived', statusReason: 'Shared driveway already permitted' }, ADMIN)
    const item = screen.getByRole('listitem')
    expect(within(item).getByText('Waived')).toBeTruthy()
    expect(within(item).getByText(/Shared driveway already permitted/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Waive condition' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark met' })).toBeNull()
  })
})
