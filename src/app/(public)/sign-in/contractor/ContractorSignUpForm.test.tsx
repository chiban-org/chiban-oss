// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'

const request = vi.hoisted(() => vi.fn())

vi.mock('./actions', () => ({ requestContractorLinkAction: request }))

const { ContractorSignUpForm } = await import('./ContractorSignUpForm')

afterEach(() => {
  cleanup()
  request.mockReset()
})

function submit(email: string) {
  render(
    <CsrfProvider token="t1">
      <ContractorSignUpForm townName="Alder Pond" linkMinutes={15} />
    </CsrfProvider>,
  )
  fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
}

describe('ContractorSignUpForm', () => {
  it('names the address, the town and the real link lifetime after sending', async () => {
    request.mockResolvedValue({ status: 'sent', email: 'pat@builder.example' })
    submit('pat@builder.example')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Check pat@builder.example for a link from Alder Pond.',
      ),
    )
    expect(screen.getByRole('status').textContent).toContain('It works once, for 15 minutes.')
  })

  it('shows why nothing was sent', async () => {
    request.mockResolvedValue({
      status: 'refused',
      message: 'Too many requests. Try again in a few minutes.',
    })
    submit('pat@builder.example')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Too many requests. Try again in a few minutes.',
      ),
    )
  })
})
