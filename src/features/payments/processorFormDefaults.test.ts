import { describe, expect, it } from 'vitest'
import { processorFormDefaults } from '@/features/payments/processorFormDefaults'

const account = {
  id: 'a',
  processor: 'simulated' as const,
  mode: 'test' as const,
  accountRef: 'sim_town',
  settings: {},
  isActive: true,
  createdAt: new Date('2026-06-01T00:00:00Z'),
}

describe('processorFormDefaults', () => {
  it('starts the form from the active account', () => {
    expect(
      processorFormDefaults([
        { ...account, id: 'old', processor: 'stripe', accountRef: 'acct_1', isActive: false },
        account,
      ]),
    ).toEqual({
      processor: 'simulated',
      mode: 'test',
      accountRef: 'sim_town',
      apiBase: '',
      ecommBase: '',
      deviceId: '',
    })
  })

  it('carries the Clover addresses and reader id the active account was saved with', () => {
    expect(
      processorFormDefaults([
        {
          ...account,
          processor: 'clover',
          mode: 'live',
          accountRef: 'MID1',
          settings: {
            apiBase: 'https://api.clover.com',
            ecommBase: 'https://scl.clover.com',
            deviceId: 'R1',
          },
        },
      ]),
    ).toMatchObject({
      processor: 'clover',
      mode: 'live',
      apiBase: 'https://api.clover.com',
      deviceId: 'R1',
    })
  })

  it('with no active account it leaves the form blank', () => {
    expect(processorFormDefaults([{ ...account, isActive: false }])).toBeNull()
  })
})
