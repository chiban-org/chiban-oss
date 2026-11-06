// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { paymentAttempts } from '@/db/schema'
import { expectRefusalAfterSubmit, expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('../actions', () => ({
  checkWithProcessorAction: answer,
  voidAttemptAction: answer,
  recordOutcomeByHandAction: answer,
}))

const { AttemptRail } = await import('./AttemptRail')
const { ManualOutcomeForm } = await import('./ManualOutcomeForm')

afterEach(cleanup)

function renderIn(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

const attempt = (overrides: Record<string, unknown> = {}) =>
  ({
    id: '5d6e7f80-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
    state: 'pending',
    channel: 'card_present',
    outcomeUnknown: false,
    anomaly: null,
    lastCheckError: null,
    processorObjectId: null,
    ...overrides,
  }) as unknown as typeof paymentAttempts.$inferSelect

describe('payment attempt forms', () => {
  it('shows a refused void reason beside the reason field', async () => {
    refusal.field = 'reason'
    refusal.message = 'Enter a reason of at least 10 characters.'
    renderIn(
      <AttemptRail
        attempt={attempt()}
        viewer={{ canCheck: false, canVoid: true, canRecordOutcome: false }}
        links={{ processor: null, receipt: null }}
      />,
    )
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Void this attempt' }))
    await expectRefusalBeside(
      screen.getByLabelText(/^Reason/),
      'Enter a reason of at least 10 characters.',
    )
  })

  it('shows a refused note beside the note field on the by-hand outcome form', async () => {
    refusal.field = 'note'
    refusal.message = 'Enter a note of at least 10 characters.'
    renderIn(<ManualOutcomeForm attempt={attempt()} />)
    fireEvent.change(screen.getByLabelText(/^What the processor confirmed/), {
      target: { value: 'declined' },
    })
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'short' } })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record outcome' }),
      () => screen.getByLabelText(/^Note/),
      'Enter a note of at least 10 characters.',
    )
  })
})
