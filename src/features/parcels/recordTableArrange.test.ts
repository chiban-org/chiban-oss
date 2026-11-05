import { describe, expect, it } from 'vitest'
import type { ParcelHistory } from '@/features/parcels/parcelHistory'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { arrangeRecordTable, readRecordTableView } from '@/features/parcels/recordTableView'
import { caseRecord, dates, file, history, PARCEL, PATH, permit } from '@/test/recordTableFixtures'

const view = (raw: Record<string, string | string[]> = {}) => readRecordTableView(raw)

function arranged(h: ParcelHistory, raw: Record<string, string | string[]> = {}) {
  return arrangeRecordTable(buildRecordTable(h, PARCEL), view(raw), PATH)
}

const numbers = (rows: { number: string | null }[]) => rows.map((r) => r.number)

describe('arrangeRecordTable', () => {
  const sample = history([
    permit('a1', 'EL-0003', { dates: dates({ filed: '2027-01-05' }) }),
    permit('a2', 'EL-0005', {
      closed: true,
      status: { label: 'Issued', chip: 'passed' },
      dates: dates({ filed: '2027-01-02', issued: '2027-03-01' }),
    }),
    permit('a3', 'BP-0001', {
      title: 'Building permit',
      type: { key: 'BP', label: 'Building permit' },
      dates: dates({ filed: '2027-01-05' }),
    }),
    caseRecord('c1', { dates: dates({ filed: '2027-02-01' }) }),
    permit('a4', 'EL-0009'),
  ])

  it('lists newest activity first, ties by number, undated last', () => {
    const shuffled = history([...sample.own].reverse())
    expect(numbers(arranged(sample).own)).toEqual([
      'EL-0005',
      'EC-c1',
      'EL-0003',
      'BP-0001',
      'EL-0009',
    ])
    expect(numbers(arranged(shuffled).own)).toEqual(numbers(arranged(sample).own))
  })

  it('sorts by a column from the header link', () => {
    expect(numbers(arranged(sample, { sort: 'number', dir: 'asc' }).own)).toEqual([
      'BP-0001',
      'EC-c1',
      'EL-0003',
      'EL-0005',
      'EL-0009',
    ])
    expect(numbers(arranged(sample, { sort: 'filed', dir: 'asc' }).own).slice(0, 2)).toEqual([
      'EL-0005',
      'EL-0003',
    ])
    const links = arranged(sample).links
    expect(links.number.href).toBe(`${PATH}?sort=number&dir=asc#records`)
    expect(links.activity.direction).toBe('desc')
  })

  it('filters by kind and by open or closed, with counts from the other filter', () => {
    const result = arranged(sample, { kind: 'EL', state: 'open' })
    expect(numbers(result.own)).toEqual(['EL-0003', 'EL-0009'])
    const [kinds, states] = result.chips
    expect(kinds?.chips.map((c) => [c.label, c.count, c.active])).toEqual([
      ['Building permit', 1, false],
      ['Code enforcement case', 1, false],
      ['Electrical permit', 2, true],
    ])
    expect(states?.chips.map((c) => [c.label, c.count, c.active])).toEqual([
      ['Open', 2, true],
      ['Closed', 1, false],
    ])
    expect(result.clear).toBe(`${PATH}#records`)
    expect(result.total).toBe(5)
  })

  it('keeps closed rows in the list but marks them', () => {
    const rows = arranged(sample).own
    expect(rows.find((r) => r.number === 'EL-0005')?.closed).toBe(true)
    expect(rows).toHaveLength(5)
  })

  it('takes only the first open or closed choice', () => {
    const result = arranged(sample, { state: ['closed', 'open', 'nope'] })
    expect(numbers(result.own)).toEqual(['EL-0005'])
  })

  it('applies the filters inside ancestral groups and drops groups left empty', () => {
    const h = history(
      [],
      [
        {
          parcelId: 'p0',
          displayId: '007',
          label: 'from parent lot 007',
          records: [permit('a9', 'EL-9'), caseRecord('c9')],
        },
      ],
    )
    expect(arranged(h, { kind: 'enforcement_case' }).ancestral[0]?.rows).toHaveLength(1)
    expect(arranged(h, { state: 'closed' }).ancestral).toEqual([])
  })
})
