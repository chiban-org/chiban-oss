// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'

vi.mock('./clockFeeActions', () => ({
  adjustClockAction: () =>
    Promise.resolve({
      ok: false,
      error: 'Enter the number of days or a new due date.',
      fieldErrors: { days: 'Enter the number of days or a new due date.' },
    }),
}))
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

  it('shows a refused day count beside the Days field and bounds the field to 1 to 365', async () => {
    render(
      <CsrfProvider token="t">
        <ClockAdjustForm
          view={view({ canAdjustClock: true, canRecordStatutoryException: false })}
          clockId="5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f"
          allowedKinds={['extension']}
        />
      </CsrfProvider>,
    )
    const days = screen.getByRole('spinbutton', { name: 'Days' })
    expect([days.getAttribute('min'), days.getAttribute('max'), days.getAttribute('step')]).toEqual(
      ['1', '365', '1'],
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Reason/ }), {
      target: { value: 'Applicant asked' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply adjustment' }))
    await waitFor(() => expect(days.getAttribute('aria-invalid')).toBe('true'))
    const message = document.getElementById(days.getAttribute('aria-describedby') ?? '')
    expect(message?.textContent).toBe('Enter the number of days or a new due date.')
    expect(days.closest('[data-slot="field"]')?.contains(message ?? null)).toBe(true)
  })
})
