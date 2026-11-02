import type { RecordRule } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { codeEditionPanelRows } from '@/features/building/editionPanelRows'

const RULE = {
  fields: [
    'receiptDate',
    'completedDate',
    'classification',
    'dwellingUnits',
    'editionKey',
    'applicantElection',
    'localAmendmentsInForce',
  ],
} as RecordRule

const RECORD = {
  receiptDate: '2027-05-20',
  completedDate: '2027-05-21',
  classification: 'nonresidential',
  dwellingUnits: null,
  editionKey: 'nh.edition.2024_07_01',
  editionLabel: 'IBC 2021 (effective 2024-07-01)',
  applicantElection: null,
  localAmendmentsInForce: [],
}

describe('codeEditionPanelRows', () => {
  it('labels every row in words and keeps raw keys out of the output', () => {
    const rows = codeEditionPanelRows(RULE, RECORD)
    expect(rows).toEqual([
      { field: 'Application received', value: 'May 20, 2027' },
      { field: 'Application complete', value: 'May 21, 2027' },
      { field: 'Permit type', value: 'Nonresidential' },
      { field: 'Dwelling units', value: 'Not recorded' },
      { field: 'Code edition', value: 'IBC 2021 (effective July 1, 2024)' },
      { field: 'Applicant election', value: 'Not recorded' },
      { field: 'Local amendments in force', value: 'None' },
    ])
  })

  it('lists local amendments by title', () => {
    const rows = codeEditionPanelRows(RULE, {
      ...RECORD,
      localAmendmentsInForce: [{ key: 'a', title: 'Stair rise limit', codeSection: 'R311.7' }],
    })
    expect(rows.at(-1)).toEqual({
      field: 'Local amendments in force',
      value: 'Stair rise limit (R311.7)',
    })
  })

  it('falls back to a spaced, capitalized name for a field it has no label for', () => {
    const rows = codeEditionPanelRows({ fields: ['permitFeeBasis'] } as RecordRule, {
      permitFeeBasis: 'flat',
    })
    expect(rows).toEqual([{ field: 'Permit fee basis', value: 'flat' }])
  })
})
