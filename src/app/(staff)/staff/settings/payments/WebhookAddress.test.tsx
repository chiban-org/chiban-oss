// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebhookAddress } from './WebhookAddress'

afterEach(cleanup)

const ADDRESS =
  'https://alderpond.example/api/payments/webhooks/5b0c8f0e-0000-4000-8000-000000000001'

describe('webhook address', () => {
  it('shows the full address and copies it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<WebhookAddress address={ADDRESS} />)
    expect(screen.getByLabelText('Webhook address')).toHaveProperty('value', ADDRESS)
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(writeText).toHaveBeenCalledWith(ADDRESS)
    expect(await screen.findByText('Copied.')).toBeDefined()
  })

  it('says to select the address by hand when copying is refused', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<WebhookAddress address={ADDRESS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(
      await screen.findByText('Copying did not work. Select the address and copy it.'),
    ).toBeDefined()
  })
})
