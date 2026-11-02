// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'

vi.mock('./clockFeeActions', () => ({ adjustClockAction: () => Promise.resolve({ ok: true }) }))
vi.mock('./actions', () => ({}))

const { ClockAdjustForm } = await import('./panels')

afterEach(cleanup)

function view(permissions: Record<string, boolean>): StaffApplicationView {
  return { permissions } as unknown as StaffApplicationView
}

function kinds(): string[] {
  return screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
}

describe('ClockAdjustForm', () => {
  it('lists only the adjustment kinds the clock rule allows', () => {
    render(
      <CsrfProvider token="t">
        <ClockAdjustForm
          view={view({ canAdjustClock: true, canRecordStatutoryException: true })}
          clockId="c1"
          allowedKinds={['statutory_exception']}
        />
      </CsrfProvider>,
    )
    expect(kinds()).toEqual(['statutory_exception'])
  })

  it('hides kinds the viewer lacks permission for', () => {
    render(
      <CsrfProvider token="t">
        <ClockAdjustForm
          view={view({ canAdjustClock: true, canRecordStatutoryException: false })}
          clockId="c1"
          allowedKinds={['extension', 'statutory_exception']}
        />
      </CsrfProvider>,
    )
    expect(kinds()).toEqual(['extension'])
  })

  it('renders nothing when no kind is available to the viewer', () => {
    const { container } = render(
      <CsrfProvider token="t">
        <ClockAdjustForm
          view={view({ canAdjustClock: true, canRecordStatutoryException: false })}
          clockId="c1"
          allowedKinds={['statutory_exception']}
        />
      </CsrfProvider>,
    )
    expect(container.querySelector('details')).toBeNull()
  })
})
