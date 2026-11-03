import { describe, expect, it } from 'vitest'
import { activeFilterLabels, queueHref } from '@/features/queue/queueParams'

describe('activeFilterLabels', () => {
  it('names nothing for the default needs action view', () => {
    expect(activeFilterLabels({})).toEqual([])
    expect(activeFilterLabels({ state: '', q: '' })).toEqual([])
  })

  it('names each filter in the order of the filter bar', () => {
    expect(
      activeFilterLabels({ q: '0042', state: 'denied', mine: '1', overdue: '1', unpaid: '1' }),
    ).toEqual(['Number contains 0042', 'Denied', 'Assigned to me', 'Overdue only', 'Fees due'])
  })

  it('names the wide view and ignores an unknown status', () => {
    expect(activeFilterLabels({ state: 'all' })).toEqual(['All but draft'])
    expect(activeFilterLabels({ state: 'bogus' })).toEqual([])
  })
})

describe('queueHref', () => {
  it('keeps the filters, drops empty values, and adds the cursor', () => {
    expect(queueHref({ q: '', state: 'all', overdue: '1', cursor: '25' }, '50')).toBe(
      '/staff/queue?state=all&overdue=1&cursor=50',
    )
  })

  it('drops the cursor for the first page', () => {
    expect(queueHref({ mine: '1', cursor: '25' }, '0')).toBe('/staff/queue?mine=1')
    expect(queueHref({}, null)).toBe('/staff/queue')
  })
})
