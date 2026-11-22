// @vitest-environment jsdom

import { ME_PACK } from '@packs/me'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultWordingFor } from '@/features/notifications/wording/wordingStandard'
import { setActivePackForTest } from '@/features/packs/registry'
import { ACKNOWLEDGING_PACK } from '@/test/packs/acknowledgingPack'
import RequestReceivedPage from './page'

afterEach(() => {
  cleanup()
  setActivePackForTest(null)
})

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

  it('under an acknowledging pack promises an acknowledgement, not an answer', async () => {
    setActivePackForTest(ACKNOWLEDGING_PACK)
    await show({ ref: 'RK-2027-0004', due: '2027-07-09', emailed: '1' })
    expect(
      screen.getByText(
        'The town will acknowledge your request by July 9, 2027. It may ask you to clarify which records you want, and will tell you in writing when it expects to respond.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/will answer by/)).toBeNull()
    expect(screen.queryByText(/deny the request in writing/)).toBeNull()
  })

  it('under an acknowledging pack without a date still says what happens next', async () => {
    setActivePackForTest(ACKNOWLEDGING_PACK)
    await show({ ref: 'RK-2027-0004', emailed: '1' })
    expect(
      screen.getByText(
        'The town may ask you to clarify which records you want, and will tell you in writing when it expects to respond.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/^It /)).toBeNull()
  })

  it('without a date keeps the New Hampshire next step unchanged', async () => {
    await show({ ref: 'RK-2027-0004', emailed: '1' })
    expect(
      screen.getByText(
        'It will make the records available, deny the request in writing, or tell you in writing when it will answer.',
      ),
    ).toBeTruthy()
  })

  it('under an acknowledging pack the receipt email makes the same promise', () => {
    setActivePackForTest(ACKNOWLEDGING_PACK)
    const body = defaultWordingFor({ recordsRequest: 'records request' }).rtk_request_received.body
    expect(body).toContain(
      'The town will acknowledge your request by {{request.due}}. It may ask you to clarify which records you want, and will tell you in writing when it expects to respond.',
    )
    expect(body).not.toContain('deny the request in writing')
  })

  it('shows a request number with the pack prefix and refuses another prefix', async () => {
    setActivePackForTest(ME_PACK)
    await show({ ref: 'FOAA-2026-0001', due: '2026-07-09', emailed: '1' })
    expect(screen.getByText('FOAA-2026-0001')).toBeTruthy()
    cleanup()
    await show({ ref: 'RK-2026-0001', due: '2026-07-09', emailed: '1' })
    expect(screen.queryByText('RK-2026-0001')).toBeNull()
  })
})
