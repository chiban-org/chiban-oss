// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { MagicLinkForm } from './MagicLinkForm'

const SENT = 'If that address can sign in, a link is on its way. It expires in 15 minutes.'
const request = vi.fn(() => Promise.resolve({ message: SENT, sentTo: 'pat@alderpond.example' }))

vi.mock('./actions', () => ({ requestMagicLinkAction: () => request() }))

afterEach(cleanup)

describe('MagicLinkForm', () => {
  it('turns into a check-your-email note that can resend or start over', async () => {
    render(
      <CsrfProvider token="t1">
        <MagicLinkForm />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'pat@alderpond.example' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    await waitFor(() => expect(screen.getByText('Check pat@alderpond.example')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toBe(SENT)
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText(/Email address/)).toBeTruthy()
    expect(screen.queryByText('Check pat@alderpond.example')).toBeNull()
  })
})
