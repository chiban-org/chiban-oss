import { describe, expect, it } from 'vitest'
import { queueRedirectHref } from '@/features/queue/queueRedirect'

describe('queueRedirectHref', () => {
  it('sends a bare queue address to the needs action tab', () => {
    expect(queueRedirectHref({})).toBe('/staff/applications')
  })

  it('maps all to the All tab and a core state to the tab that holds it', () => {
    expect(queueRedirectHref({ state: 'all' })).toBe('/staff/applications?stage=all')
    expect(queueRedirectHref({ state: 'submitted' })).toBe('/staff/applications?stage=open')
    expect(queueRedirectHref({ state: 'draft' })).toBe('/staff/applications?stage=open')
    expect(queueRedirectHref({ state: 'suspended' })).toBe('/staff/applications?stage=issued')
    expect(queueRedirectHref({ state: 'expired' })).toBe('/staff/applications?stage=finished')
    expect(queueRedirectHref({ state: 'bogus' })).toBe('/staff/applications')
  })

  it('carries search, chips and sort as they are and drops the page and unknown params', () => {
    expect(
      queueRedirectHref({
        state: 'denied',
        q: 'BP-2027',
        due: ['overdue', 'week'],
        assigned: 'me',
        type: 'BP',
        flag: 'fees',
        sort: 'number',
        dir: 'desc',
        cursor: '25',
        other: 'x',
      }),
    ).toBe(
      '/staff/applications?stage=finished&q=BP-2027&due=overdue&due=week&assigned=me&type=BP&flag=fees&sort=number&dir=desc',
    )
  })
})
