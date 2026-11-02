import { describe, expect, it } from 'vitest'
import { mapStripeState } from '@/features/payments/processors/stripeState'
import disputes from '@/test/fixtures/stripe/disputes_list.json'
import requiresCapture from '@/test/fixtures/stripe/payment_intent_requires_capture.json'
import succeededAvailable from '@/test/fixtures/stripe/payment_intent_succeeded_available.json'
import succeededPending from '@/test/fixtures/stripe/payment_intent_succeeded_pending.json'
import refunds from '@/test/fixtures/stripe/refunds_list.json'

const none = { object: 'list', data: [] }
const ACCOUNT = 'acct_alder'

function map(pi: unknown, r: unknown = none, d: unknown = none) {
  const mapped = mapStripeState(pi, r, d, ACCOUNT)
  if (!mapped.ok) throw new Error(JSON.stringify(mapped.error))
  return mapped.value
}

describe('mapStripeState', () => {
  it('requires_capture maps to authorized', () => {
    expect(map(requiresCapture)).toMatchObject({
      status: 'authorized',
      settled: false,
      amountCents: 4635,
    })
  })

  it('succeeded without an available balance transaction is captured', () => {
    expect(map(succeededPending)).toMatchObject({ status: 'captured', settled: false })
  })

  it('available balance transaction maps to settled', () => {
    expect(map(succeededAvailable)).toMatchObject({ status: 'captured', settled: true })
  })

  it.each([
    ['requires_payment_method', 'pending'],
    ['requires_confirmation', 'pending'],
    ['requires_action', 'pending'],
    ['processing', 'pending'],
    ['canceled', 'canceled'],
  ])('%s maps to %s', (status, expected) => {
    expect(map({ ...requiresCapture, status }).status).toBe(expected)
  })

  it('the account ref is the one the adapter was built for', () => {
    expect(map(succeededAvailable).accountRef).toBe(ACCOUNT)
    expect(map(succeededAvailable).objectId).toBe('pi_3QfixtureSucceeded')
  })

  it('refunds keep their object id, amount, and status', () => {
    expect(map(succeededAvailable, refunds).refunds).toEqual([
      { objectId: 're_3QfixtureOne', amountCents: 1000, status: 'succeeded' },
      { objectId: 're_3QfixtureTwo', amountCents: 500, status: 'pending' },
      { objectId: 're_3QfixtureThree', amountCents: 200, status: 'failed' },
    ])
  })

  it('warning_needs_response dispute is ignored', () => {
    expect(map(succeededAvailable, none, disputes).disputes.map((d) => d.objectId)).not.toContain(
      'dp_warning',
    )
  })

  it('lost dispute maps to lost, won to won, and the rest to open', () => {
    const byId = Object.fromEntries(
      map(succeededAvailable, none, disputes).disputes.map((d) => [d.objectId, d.status]),
    )
    expect(byId).toEqual({ dp_open: 'open', dp_lost: 'lost', dp_won: 'won' })
  })

  it('a payment intent missing its amount is bad_shape', () => {
    const mapped = mapStripeState({ id: 'pi_x', status: 'succeeded' }, none, none, ACCOUNT)
    expect(mapped.ok).toBe(false)
    expect(!mapped.ok && mapped.error.kind).toBe('bad_shape')
  })
})
