import { describe, expect, it } from 'vitest'
import { mapCloverState } from '@/features/payments/processors/cloverState'
import auth from '@/test/fixtures/clover/payment_auth.json'
import fail from '@/test/fixtures/clover/payment_fail.json'
import refunded from '@/test/fixtures/clover/payment_refunded.json'
import closed from '@/test/fixtures/clover/payment_success_closed.json'
import open from '@/test/fixtures/clover/payment_success_open.json'
import voided from '@/test/fixtures/clover/payment_voided.json'

const ACCOUNT = 'MERCHANT1ALDER'

function map(payment: unknown) {
  const mapped = mapCloverState(payment, ACCOUNT)
  if (!mapped.ok) throw new Error(JSON.stringify(mapped.error))
  return mapped.value
}

describe('mapCloverState', () => {
  it('SUCCESS with CLOSED card transaction is settled', () => {
    expect(map(closed)).toMatchObject({ status: 'captured', settled: true, amountCents: 4635 })
  })

  it('SUCCESS with an OPEN card transaction is captured and not settled', () => {
    expect(map(open)).toMatchObject({ status: 'captured', settled: false })
  })

  it('AUTH is authorized', () => {
    expect(map(auth).status).toBe('authorized')
  })

  it('FAIL is declined', () => {
    expect(map(fail).status).toBe('declined')
  })

  it('VOIDED is canceled', () => {
    expect(map(voided).status).toBe('canceled')
  })

  it('refunds come from refunds.elements and always succeeded', () => {
    expect(map(refunded).refunds).toEqual([
      { objectId: 'REFUND1ALDER', amountCents: 1000, status: 'succeeded' },
    ])
  })

  it('disputes are always empty and the account ref is the merchant the adapter was built for', () => {
    expect(map(closed).disputes).toEqual([])
    expect(map(closed).accountRef).toBe(ACCOUNT)
  })

  it('a payment without an id is bad_shape', () => {
    const mapped = mapCloverState({ amount: 100, result: 'SUCCESS' }, ACCOUNT)
    expect(!mapped.ok && mapped.error.kind).toBe('bad_shape')
  })

  it('an unknown result is bad_shape', () => {
    const mapped = mapCloverState({ id: 'P', amount: 100, result: 'WHAT' }, ACCOUNT)
    expect(!mapped.ok && mapped.error.kind).toBe('bad_shape')
  })
})
