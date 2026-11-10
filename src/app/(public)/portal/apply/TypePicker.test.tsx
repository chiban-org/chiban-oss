// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TypePicker } from './TypePicker'

vi.mock('./actions', () => ({ startApplicationAction: vi.fn() }))
vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

afterEach(cleanup)

const GROUPS = {
  common: [{ key: 'DW', title: 'Driveway', description: 'A new driveway.' }],
  groups: [{ title: 'Zoning Board', types: [{ key: 'VAR', label: 'Variance' }] }],
}

describe('TypePicker', () => {
  it('keeps Continue off until a kind of application is chosen', async () => {
    render(<TypePicker parcelId="p1" grouped={GROUPS} />)
    const go = screen.getByRole('button', { name: 'Continue' })
    await waitFor(() => expect(go.hasAttribute('disabled')).toBe(true))
    expect(screen.getByText('Zoning Board (1)')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Driveway/ }))
    await waitFor(() => expect(go.hasAttribute('disabled')).toBe(false))
  })
})
