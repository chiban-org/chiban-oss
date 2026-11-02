// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'

vi.mock('./actions', () => ({
  applyConditionAction: () => Promise.resolve({ ok: true, message: '' }),
  setConditionStatusAction: () => Promise.resolve({ ok: true, message: '' }),
}))
vi.mock('./clockFeeActions', () => ({}))

const { ConditionsPanel } = await import('./panels')

afterEach(cleanup)

function view(state: string, canIssue: boolean): StaffApplicationView {
  return {
    id: 'a1',
    state,
    permissions: { canIssue },
    conditions: [
      {
        id: 'c1',
        textSnapshot: 'Approved septic design on file',
        blocksIssuance: true,
        status: 'unmet',
        statusReason: null,
      },
    ],
    conditionLibrary: [{ code: 'SEPTIC', text: 'Approved septic design on file' }],
  } as unknown as StaffApplicationView
}

function renderPanel(state: string, canIssue: boolean) {
  render(
    <CsrfProvider token="t">
      <ConditionsPanel view={view(state, canIssue)} />
    </CsrfProvider>,
  )
}

describe('ConditionsPanel', () => {
  it('offers apply and mark met to staff who issue permits', () => {
    renderPanel('under_review', true)
    expect(screen.getByRole('button', { name: 'Mark met' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply condition' })).toBeTruthy()
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
