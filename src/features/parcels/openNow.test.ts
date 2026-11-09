import { describe, expect, it } from 'vitest'
import { openItems, openNowSentence } from '@/features/parcels/openNow'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { caseRecord, dates, history, PARCEL, permit } from '@/test/recordTableFixtures'
import type { CivilDate } from '@/types/civilDate'

function rowsOf(...records: Parameters<typeof history>[0]) {
  return buildRecordTable(history(records), PARCEL).own
}

describe('the open-now sentence', () => {
  it('counts what is open on the lot, in a fixed order', () => {
    const rows = rowsOf(
      permit('a1', 'BP-1', { openAs: 'permit_in_force' }),
      caseRecord('c1', { openAs: 'case' }),
      permit('a2', 'BP-2', { openAs: 'permit_review' }),
      caseRecord('c2', { openAs: 'case' }),
      permit('a3', 'BP-3', { openAs: 'permit_review' }),
      permit('a4', 'BP-4', { openAs: 'permit_in_force' }),
    )
    expect(openNowSentence(rows)).toBe(
      'Open: 2 enforcement cases, 2 permits in review, 2 permits in force.',
    )
  })

  it('uses the singular for one of a kind', () => {
    const rows = rowsOf(
      permit('a1', 'ZBA-1', { openAs: 'board_in_force' }),
      permit('a2', 'BP-2', { openAs: 'inspection_scheduled', kind: 'inspection' }),
    )
    expect(openNowSentence(rows)).toBe('Open: 1 board approval in force, 1 inspection scheduled.')
  })

  it('says nothing is open when every record is closed', () => {
    const rows = rowsOf(permit('a1', 'BP-1', { closed: true }), caseRecord('c1', { closed: true }))
    expect(openNowSentence(rows)).toBe('Nothing open on this lot.')
    expect(openNowSentence([])).toBe('Nothing open on this lot.')
  })
})

describe('the open items', () => {
  it('lists open records with the next date that matters, cases first', () => {
    const rows = rowsOf(
      permit('a1', 'BP-1', {
        openAs: 'permit_in_force',
        dates: dates({ issued: '2026-03-01', expires: '2027-03-01' }),
      }),
      caseRecord('c1', { openAs: 'case', dates: dates({ filed: '2026-09-02' }) }),
      permit('a2', 'BP-2', { openAs: 'permit_review', dates: dates({ filed: '2026-10-05' }) }),
      permit('a3', 'BP-3', { closed: true }),
    )
    expect(openItems(rows).map((i) => [i.label, i.next])).toEqual([
      ['EC-c1', 'Opened September 2, 2026'],
      ['BP-2', 'Filed October 5, 2026'],
      ['BP-1', 'Expires March 1, 2027'],
    ])
  })

  it('dates a board approval in force by its decision when it has no issue or expiry date', () => {
    const rows = rowsOf(
      permit('a1', 'SPR-1', { openAs: 'board_in_force', dates: dates({ closed: '2026-10-14' }) }),
    )
    expect(openItems(rows)[0]?.next).toBe('Decided October 14, 2026')
  })

  it('names an inspection by its type and dates it by its schedule', () => {
    const rows = rowsOf(
      permit('i1', 'BP-1', {
        kind: 'inspection',
        title: 'Framing inspection',
        openAs: 'inspection_scheduled',
        scheduled: '2026-11-12' as CivilDate,
      }),
    )
    expect(openItems(rows)[0]).toMatchObject({
      label: 'Framing inspection',
      sublabel: 'BP-1',
      next: 'Scheduled November 12, 2026',
    })
  })
})
