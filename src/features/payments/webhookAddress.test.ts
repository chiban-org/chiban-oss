import { describe, expect, it } from 'vitest'
import { webhookAddress } from '@/features/payments/webhookAddress'

describe('webhookAddress', () => {
  it('joins the site address and the account', () => {
    expect(webhookAddress('acct-1', 'https://alderpond.example')).toBe(
      'https://alderpond.example/api/payments/webhooks/acct-1',
    )
  })

  it('does not double a trailing slash', () => {
    expect(webhookAddress('acct-1', 'https://alderpond.example/')).toBe(
      'https://alderpond.example/api/payments/webhooks/acct-1',
    )
  })
})
