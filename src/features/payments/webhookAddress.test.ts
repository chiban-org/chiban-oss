import { describe, expect, it } from 'vitest'
import { webhookAddress, webhookView } from '@/features/payments/webhookAddress'

const BASE = 'https://alderpond.example'

describe('webhookAddress', () => {
  it('joins the site address and the account', () => {
    expect(webhookAddress('acct-1', BASE)).toBe(
      'https://alderpond.example/api/payments/webhooks/acct-1',
    )
  })

  it('does not double a trailing slash', () => {
    expect(webhookAddress('acct-1', `${BASE}/`)).toBe(
      'https://alderpond.example/api/payments/webhooks/acct-1',
    )
  })
})

describe('webhookView', () => {
  it('has no address before an account is saved', () => {
    expect(webhookView(null, BASE)).toEqual({ state: 'unsaved' })
  })

  it('needs no address for the simulated processor', () => {
    expect(
      webhookView({ id: 'acct-1', processor: 'simulated', webhookSecret: 'sim' }, BASE),
    ).toEqual({
      state: 'not_needed',
    })
  })

  it('gives the address of a real processor account', () => {
    expect(
      webhookView({ id: 'acct-1', processor: 'stripe', webhookSecret: 'whsec_1' }, BASE),
    ).toEqual({
      state: 'ready',
      address: 'https://alderpond.example/api/payments/webhooks/acct-1',
      receiving: true,
    })
  })

  it('says an account without a signing secret is not receiving updates', () => {
    expect(webhookView({ id: 'acct-1', processor: 'stripe', webhookSecret: '' }, BASE)).toEqual({
      state: 'ready',
      address: 'https://alderpond.example/api/payments/webhooks/acct-1',
      receiving: false,
    })
  })
})
