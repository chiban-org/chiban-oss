import { describe, expect, it } from 'vitest'
import { contactChips, contactTabs } from '@/features/rosters/contactChips'
import { readContactsQuery } from '@/features/rosters/contactListParams'

const counts = { active: 4, ended: 2, due: 1 }
const totals = { associations: counts, parks: { active: 3, ended: 0, due: 0 }, holders: counts }

function chips(raw: Record<string, string>) {
  const { params, query } = readContactsQuery(raw)
  return contactChips(params, query, counts).flatMap((g) => g.chips)
}

describe('notice contact tabs', () => {
  it('puts missing associations first only when some are missing, and counts active rows', () => {
    expect(contactTabs('parks', totals, 2).map((t) => [t.label, t.count, t.active])).toEqual([
      ['Missing association', 2, false],
      ['Associations', 4, false],
      ['Parks', 3, true],
      ['Restriction holders', 4, false],
      ['Regional and state', undefined, false],
    ])
    expect(contactTabs('associations', totals, 0).map((t) => t.label)[0]).toBe('Associations')
  })

  it('links each tab fresh, without the current search or filters', () => {
    expect(contactTabs('parks', totals, 0).map((t) => t.href)).toEqual([
      '/staff/notice-contacts',
      '/staff/notice-contacts?kind=parks',
      '/staff/notice-contacts?kind=holders',
      '/staff/notice-contacts?kind=regional',
    ])
  })
})

describe('notice contact quick filters', () => {
  it('opens on Active, with Due and Ended off', () => {
    expect(chips({ kind: 'parks' }).map((c) => [c.label, c.active, c.count, c.href])).toEqual([
      ['Due for a check', false, 1, '/staff/notice-contacts?kind=parks&due=yes'],
      ['Active', true, 4, '/staff/notice-contacts?kind=parks'],
      ['Ended', false, 2, '/staff/notice-contacts?kind=parks&status=ended'],
    ])
  })

  it('turns Ended back to Active and Due off, keeping the search and dropping the page', () => {
    const shown = chips({ kind: 'parks', q: 'loon', status: 'ended', due: 'yes', cursor: '25' })
    expect(shown.map((c) => [c.label, c.active, c.href])).toEqual([
      ['Due for a check', true, '/staff/notice-contacts?kind=parks&q=loon&status=ended'],
      ['Active', false, '/staff/notice-contacts?kind=parks&q=loon&due=yes'],
      ['Ended', true, '/staff/notice-contacts?kind=parks&q=loon&due=yes'],
    ])
  })

  it('leaves the linked entry once a filter is picked', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    const shown = chips({ kind: 'holders', entry: id })
    expect(shown.every((c) => !c.active && !c.href.includes('entry='))).toBe(true)
  })
})
