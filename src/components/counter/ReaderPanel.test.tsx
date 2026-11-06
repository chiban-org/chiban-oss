// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CounterActions, ReaderStatus } from '@/components/counter/counterTypes'
import { ReaderPanel } from '@/components/counter/ReaderPanel'

afterEach(cleanup)

const LOST: ReaderStatus = { ok: true, state: 'pending', outcomeUnknown: true }
const CAPTURED: ReaderStatus = { ok: true, state: 'captured', outcomeUnknown: false }
const DECLINED: ReaderStatus = { ok: true, state: 'declined', outcomeUnknown: false }

const ISSUED = {
  ok: true as const,
  state: 'issued' as const,
  number: 'EL-2027-0001',
  applicationId: 'app',
  attemptId: 'att',
  links: { permit: '/p', placard: '/pl', receipt: '/r' },
}

function actions(overrides: Partial<CounterActions>): CounterActions {
  return {
    issue: () => Promise.resolve({ ok: false, error: 'not used' }),
    reader: () => Promise.resolve(LOST),
    check: () => Promise.resolve(LOST),
    reconnect: () => Promise.resolve(LOST),
    complete: () => Promise.resolve(ISSUED),
    ...overrides,
  }
}

async function lostConnection(overrides: Partial<CounterActions>, onIssued = vi.fn()) {
  render(
    <CsrfProvider token="t1">
      <ReaderPanel
        attemptId="att"
        applicationId="app"
        simulated={true}
        actions={actions(overrides)}
        onIssued={onIssued}
      />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Lose connection' }))
  await screen.findByRole('alert')
  return onIssued
}

describe('ReaderPanel after the connection is lost', () => {
  it('says the processor has not reported yet when Check with processor finds nothing new', async () => {
    await lostConnection({ check: () => Promise.resolve(LOST) })
    fireEvent.click(screen.getByRole('button', { name: 'Check with processor' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'The processor has not reported an outcome yet. Check again in a moment.',
      ),
    )
    expect(screen.getByRole('alert').textContent).toContain('Outcome unknown. Do not issue.')
  })

  it('issues the permit when Check with processor finds the payment captured', async () => {
    const onIssued = await lostConnection({ check: () => Promise.resolve(CAPTURED) })
    fireEvent.click(screen.getByRole('button', { name: 'Check with processor' }))
    await waitFor(() => expect(onIssued).toHaveBeenCalledWith(ISSUED))
  })

  it('issues the permit when the reader reconnects approved', async () => {
    const onIssued = await lostConnection({ reconnect: () => Promise.resolve(CAPTURED) })
    fireEvent.click(screen.getByRole('button', { name: 'Reader reconnected: approved' }))
    await waitFor(() => expect(onIssued).toHaveBeenCalledWith(ISSUED))
  })

  it('says the card was declined when the reader reconnects declined', async () => {
    await lostConnection({ reconnect: () => Promise.resolve(DECLINED) })
    fireEvent.click(screen.getByRole('button', { name: 'Reader reconnected: declined' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Card declined. The permit is not issued.',
      ),
    )
  })

  it('shows the refusal when the reconnect call fails', async () => {
    await lostConnection({
      reconnect: () => Promise.resolve({ ok: false, error: 'This reader is not simulated.' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reader reconnected: approved' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('This reader is not simulated.'),
    )
  })
})
