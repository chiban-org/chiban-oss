// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { PayButton } from '@/components/portal/PayButton'

afterEach(cleanup)

describe('PayButton', () => {
  it('names the amount in dollars and sends the payer to the checkout url', async () => {
    const navigate = vi.fn()
    const start = vi.fn((_form: FormData) =>
      Promise.resolve({ ok: true as const, redirectUrl: '/dev/checkout/x1' }),
    )
    render(
      <CsrfProvider token="t1">
        <PayButton applicationId="a1" dueCents={4635} start={start} navigate={navigate} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pay $46.35' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dev/checkout/x1'))
    expect(start.mock.calls[0]?.[0].get('applicationId')).toBe('a1')
  })

  it('shows why payment could not start', async () => {
    const start = () => Promise.resolve({ ok: false as const, error: 'Nothing is due right now.' })
    render(
      <CsrfProvider token="t1">
        <PayButton applicationId="a1" dueCents={100} start={start} navigate={vi.fn()} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pay $1.00' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Nothing is due right now.'),
    )
  })
})
