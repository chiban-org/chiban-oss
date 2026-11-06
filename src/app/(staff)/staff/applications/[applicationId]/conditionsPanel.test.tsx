// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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

const SEPTIC = { code: 'SEPTIC', text: 'Approved septic design on file' }
const DRIVEWAY = { code: 'DRIVEWAY', text: 'Driveway permit on file' }

function view(
  state: string,
  canIssue: boolean,
  library: { code: string; text: string }[] = [SEPTIC],
): StaffApplicationView {
  return {
    id: 'a1',
    state,
    permissions: { canIssue },
    conditions: [
      {
        id: 'c1',
        code: 'SEPTIC',
        textSnapshot: 'Approved septic design on file',
        blocksIssuance: true,
        status: 'unmet',
        statusReason: null,
      },
    ],
    conditionLibrary: library,
  } as unknown as StaffApplicationView
}

function renderPanel(
  state: string,
  canIssue: boolean,
  library: { code: string; text: string }[] = [SEPTIC],
) {
  render(
    <CsrfProvider token="t">
      <ConditionsPanel view={view(state, canIssue, library)} />
    </CsrfProvider>,
  )
}

describe('ConditionsPanel', () => {
  it('offers apply and mark met to staff who issue permits', () => {
    renderPanel('under_review', true, [SEPTIC, DRIVEWAY])
    expect(screen.getByRole('button', { name: 'Mark met' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply condition' })).toBeTruthy()
  })

  it('does not offer a condition that is already on the application', () => {
    renderPanel('under_review', true, [SEPTIC, DRIVEWAY])
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual([DRIVEWAY.text])
  })

  it('offers no apply form once every library condition is on the application', () => {
    renderPanel('under_review', true, [SEPTIC])
    expect(screen.queryByRole('button', { name: 'Apply condition' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark met' })).toBeTruthy()
  })

  it('shows the conditions read-only to roles that cannot issue', () => {
    renderPanel('under_review', false)
    expect(screen.getByText(/Approved septic design on file/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark met' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply condition' })).toBeNull()
  })

  it('shows the conditions read-only once the application is closed', () => {
    renderPanel('closed', true)
    expect(screen.queryByRole('button', { name: 'Mark met' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply condition' })).toBeNull()
  })
})
