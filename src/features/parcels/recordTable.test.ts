import { describe, expect, it } from 'vitest'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { caseRecord, dates, file, history, PARCEL, permit } from '@/test/recordTableFixtures'

describe('buildRecordTable', () => {
  it('nests each file under the record it belongs to, newest first', () => {
    const table = buildRecordTable(
      history([
        file('d1', { kind: 'application', id: 'a1' }, '2027-01-02'),
        permit('a1', 'EL-1'),
        file('d2', { kind: 'application', id: 'a1' }, '2027-02-02'),
        file('d3', { kind: 'enforcement_case', id: 'c1' }, '2027-03-02'),
        caseRecord('c1'),
      ]),
      PARCEL,
    )
    expect(table.own.map((r) => r.key)).toEqual(['application:a1', 'enforcement_case:c1'])
    expect(table.own[0]?.files.map((f) => f.id)).toEqual(['d2', 'd1'])
    expect(table.own[0]?.files[0]).toEqual({
      id: 'd2',
      title: 'File d2',
      kindLabel: 'Attachment',
      href: '/api/documents/d2',
      visibility: { label: 'Private', chip: 'neutral' },
      added: '2027-02-02',
    })
    expect(table.own[1]?.files.map((f) => f.id)).toEqual(['d3'])
  })

  it('leaves parcel files and this parcel’s own documents to the Documents panel', () => {
    const table = buildRecordTable(
      history([
        file('d1', { kind: 'parcel', id: PARCEL }, '2027-01-02', { parcelFile: true }),
        file('d2', { kind: 'parcel', id: PARCEL }, '2027-01-03'),
        permit('a1', 'EL-1'),
      ]),
      PARCEL,
    )
    expect(table.own.map((r) => r.key)).toEqual(['application:a1'])
    expect(table.own[0]?.files).toEqual([])
  })

  it('keeps a file whose record the viewer cannot see as its own row', () => {
    const table = buildRecordTable(
      history([file('d1', { kind: 'meeting', id: 'm1' }, '2027-01-02')]),
      PARCEL,
    )
    expect(table.own).toHaveLength(1)
    expect(table.own[0]).toMatchObject({
      key: 'document:d1',
      title: 'Attachment',
      number: 'File d1',
      href: '/api/documents/d1',
      typeKey: 'document',
      files: [],
      closed: false,
    })
  })

  it('carries dates and works out the latest activity, ignoring a future expiry', () => {
    const table = buildRecordTable(
      history([
        permit('a1', 'EL-1', {
          dates: dates({
            filed: '2027-01-01',
            issued: '2027-02-01',
            expires: '2028-02-01',
            closed: '2027-01-20',
          }),
        }),
      ]),
      PARCEL,
    )
    expect(table.own[0]?.dates.expires).toBe('2028-02-01')
    expect(table.own[0]?.activity).toBe('2027-02-01')
  })

  it('treats historical records and decided inspections as closed', () => {
    const table = buildRecordTable(
      history([
        {
          kind: 'historical_record',
          recordId: 'h1',
          title: 'Building permit',
          number: 'B-1',
          status: { label: 'Historical record', chip: 'neutral' },
          date: null,
          href: null,
          dates: dates({ filed: '1988-01-01' }),
        },
        {
          kind: 'inspection',
          recordId: 'i1',
          title: 'Rough inspection',
          number: 'EL-1',
          status: { label: 'Passed', chip: 'passed' },
          date: null,
          href: null,
          dates: dates({ filed: '2027-01-01', closed: '2027-01-05' }),
        },
        {
          kind: 'inspection',
          recordId: 'i2',
          title: 'Final inspection',
          number: 'EL-1',
          status: { label: 'Scheduled', chip: 'neutral' },
          date: null,
          href: null,
          dates: dates({ filed: '2027-01-01' }),
        },
      ]),
      PARCEL,
    )
    expect(table.own.map((r) => [r.recordId, r.closed])).toEqual([
      ['h1', true],
      ['i1', true],
      ['i2', false],
    ])
  })

  it('nests files across ancestral groups and keeps the link for carrying forward', () => {
    const table = buildRecordTable(
      history(
        [file('d1', { kind: 'application', id: 'a9' }, '2027-01-02')],
        [
          {
            parcelId: 'p0',
            displayId: '007',
            label: 'from parent lot 007, before the 2027 subdivision',
            records: [{ ...permit('a9', 'BP-9'), linkId: 'link-9' }],
          },
        ],
      ),
      PARCEL,
    )
    expect(table.own).toEqual([])
    expect(table.ancestral[0]?.rows[0]?.linkId).toBe('link-9')
    expect(table.ancestral[0]?.rows[0]?.files.map((f) => f.id)).toEqual(['d1'])
  })
})
