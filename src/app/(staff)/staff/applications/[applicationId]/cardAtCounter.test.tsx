// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReaderStatus } from '@/components/counter/counterTypes'
import { CardAtCounter } from './cardAtCounter'
import type { CardActions } from './cardTypes'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  cleanup()
  refresh.mockReset()
})

const PENDING: ReaderStatus = { ok: true, state: 'pending', outcomeUnknown: false }
const LOST: ReaderStatus = { ok: true, state: 'pending', outcomeUnknown: true }
const CAPTURED: ReaderStatus = { ok: true, state: 'captured', outcomeUnknown: false }
const DECLINED: ReaderStatus = { ok: true, state: 'declined', outcomeUnknown: false }

function actions(overrides: Partial<CardActions> = {}): CardActions {
  return {
    start: () => Promise.resolve({ ok: true, attemptId: 'att', outcomeUnknown: false }),
    reader: () => Promise.resolve(CAPTURED),
    check: () => Promise.resolve(PENDING),
    reconnect: () => Promise.resolve(CAPTURED),
    ...overrides,
  }
}

function show(overrides: Partial<CardActions> = {}, simulated = true) {
  render(
    <CsrfProvider token="t1">
      <CardAtCounter
        applicationId="app"
        dueCents={4500}
        feeCents={135}
        simulated={simulated}
        actions={actions(overrides)}
      />
    </CsrfProvider>,
  )
}

async function startCard() {
  fireEvent.change(screen.getByLabelText(/^Payer name( \*)?$/), {
    target: { value: 'Pat Contractor' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Start card payment' }))
  await screen.findByText(/Waiting for the card on the reader/)
}

describe('card at the counter on an application balance', () => {
  it('says what the card will be charged, card fee included', () => {
    show()
    expect(
      screen.getByText('The reader charges $46.35: $45.00 due plus a $1.35 card fee.'),
    ).toBeTruthy()
  })

  it('leaves the fee out of the sentence when there is none', () => {
    render(
      <CsrfProvider token="t1">
        <CardAtCounter
          applicationId="app"
          dueCents={4500}
          feeCents={0}
          simulated={false}
          actions={actions()}
        />
      </CsrfProvider>,
    )
    expect(screen.getByText('The reader charges $45.00.')).toBeTruthy()
  })

  it('sends the application and payer when starting', async () => {
    const start = vi.fn(actions().start)
    show({ start })
    await startCard()
    const sent = start.mock.calls[0]?.[0]
    expect(sent?.get('applicationId')).toBe('app')
    expect(sent?.get('payerName')).toBe('Pat Contractor')
    expect(sent?.get('csrf_token')).toBe('t1')
  })

  it('shows pending until the processor approves, then refreshes the record', async () => {
    show()
    await startCard()
    expect(screen.getByText(/Nothing is posted until the processor approves/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await screen.findByText('Card approved. The payment is in the ledger.')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows declined and lets staff try again', async () => {
    show({ reader: () => Promise.resolve(DECLINED) })
    await startCard()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await screen.findByText('Card declined. Nothing was charged and the balance is unchanged.')
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try the card again' }))
    expect(screen.getByRole('button', { name: 'Start card payment' })).toBeTruthy()
  })

  it('warns when the outcome is unknown and checks with the processor', async () => {
    const check = vi.fn(() => Promise.resolve(CAPTURED))
    show({ reader: () => Promise.resolve(LOST), check })
    await startCard()
    fireEvent.click(screen.getByRole('button', { name: 'Lose connection' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Outcome unknown.')
    fireEvent.click(screen.getByRole('button', { name: 'Check with processor' }))
    await screen.findByText('Card approved. The payment is in the ledger.')
    expect(check).toHaveBeenCalled()
  })

  it('offers only Check with processor for a live reader while pending', async () => {
    show({}, false)
    await startCard()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Check with processor' })).toBeTruthy()
  })

  it('shows why the card could not start', async () => {
    show({ start: () => Promise.resolve({ ok: false, error: 'No reader.' }) })
    fireEvent.change(screen.getByLabelText(/^Payer name( \*)?$/), { target: { value: 'Pat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start card payment' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('No reader.'))
  })

  it('picks up a card payment that is still open after the record reloads', async () => {
    const check = vi.fn((_form: FormData) => Promise.resolve(CAPTURED))
    render(
      <CsrfProvider token="t1">
        <CardAtCounter
          applicationId="app"
          dueCents={4500}
          feeCents={135}
          simulated={false}
          actions={actions({ check })}
          resume={{ attemptId: 'att', outcomeUnknown: false }}
        />
      </CsrfProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Start card payment' })).toBeNull()
    expect(screen.getByText(/Waiting for the card on the reader/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the card payment' }).getAttribute('href')).toBe(
      '/staff/payments/att',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check with processor' }))
    await screen.findByText('Card approved. The payment is in the ledger.')
    expect(check.mock.calls[0]?.[0]?.get('attemptId')).toBe('att')
  })
})
