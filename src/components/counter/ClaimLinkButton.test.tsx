// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ClaimLinkButton } from '@/components/counter/ClaimLinkButton'

afterEach(cleanup)

describe('ClaimLinkButton', () => {
  it('sends the claim link for the application and says so', async () => {
    const send = vi.fn((_form: FormData) =>
      Promise.resolve({ ok: true as const, message: 'Claim link sent.' }),
    )
    render(
      <CsrfProvider token="t1">
        <ClaimLinkButton applicationId="a1" send={send} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send claim link to contractor' }))
    await waitFor(() => expect(screen.getByText('Claim link sent.')).toBeTruthy())
    const form = send.mock.calls[0]?.[0]
    expect(form?.get('applicationId')).toBe('a1')
    expect(form?.get('csrf_token')).toBe('t1')
  })

  it('shows the error when the link cannot be sent', async () => {
    const send = () =>
      Promise.resolve({ ok: false as const, error: 'The contractor has no email.' })
    render(
      <CsrfProvider token="t1">
        <ClaimLinkButton applicationId="a1" send={send} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send claim link to contractor' }))
    await waitFor(() => expect(screen.getByText('The contractor has no email.')).toBeTruthy())
  })
})
