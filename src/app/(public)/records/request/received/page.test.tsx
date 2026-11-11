// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RequestReceivedPage from './page'

afterEach(cleanup)

async function show(params: Record<string, string>) {
  render(await RequestReceivedPage({ searchParams: Promise.resolve(params) }))
}

describe('RequestReceivedPage', () => {
  it('shows the request number, the answer date and that a receipt was emailed', async () => {
    await show({ ref: 'RK-2027-0004', due: '2027-07-21', emailed: '1' })
    expect(screen.getByText('RK-2027-0004')).toBeTruthy()
    expect(screen.getByText('The town will answer by July 21, 2027.')).toBeTruthy()
    expect(screen.getByText('A receipt was sent to your email.')).toBeTruthy()
  })

  it('says when the receipt could not be sent', async () => {
    await show({ ref: 'RK-2027-0004', due: '2027-07-21', emailed: '0' })
    expect(
      screen.getByText(
        'The receipt email could not be sent. Keep this number to ask about your request.',
      ),
    ).toBeTruthy()
  })

  it('shows nothing it cannot trust from the address bar', async () => {
    await show({ ref: '<b>fake</b>', due: 'soon', emailed: '1' })
    expect(screen.queryByText('<b>fake</b>')).toBeNull()
    expect(screen.queryByText(/will answer by/)).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Request received' })).toBeTruthy()
  })
})
