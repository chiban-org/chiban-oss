import { describe, expect, it } from 'vitest'
import {
  choicesFromRows,
  namedKeyRows,
  numberQuestionsFor,
  type ReferenceRow,
} from '@/features/config/referenceChoices'

const TYPE = {
  key: 'BP',
  label: 'Building permit',
  formKey: 'bp-form',
  feeScheduleKey: 'bp-fees',
  conditionLibraryKey: 'bp-conditions',
}

const ROWS: ReferenceRow[] = [
  { kind: 'application_type', key: 'BP', status: 'published', body: TYPE },
  {
    kind: 'fee_schedule',
    key: 'bp-fees',
    status: 'published',
    body: { key: 'bp-fees', lines: [] },
  },
  { kind: 'condition_library', key: 'bp-conditions', status: 'published', body: { key: 'x' } },
  { kind: 'fee_schedule', key: 'spare_fees', status: 'draft', body: { key: 'spare_fees' } },
  {
    kind: 'inspection_checklist',
    key: 'bp-final',
    status: 'published',
    body: { label: 'Final inspection', inspectionType: 'final', final: true },
  },
  {
    kind: 'form',
    key: 'bp-form',
    status: 'published',
    body: {
      label: 'Building permit application',
      fields: [
        { key: 'finished_sq_ft', label: 'Finished square feet', type: 'integer' },
        { key: 'owner', label: 'Owner', type: 'text' },
      ],
    },
  },
  {
    kind: 'form',
    key: 'bp-form',
    status: 'draft',
    body: {
      label: 'Building permit application (new)',
      fields: [{ key: 'deck_sq_ft', label: 'Deck square feet', type: 'decimal' }],
    },
  },
]

describe('reference choices', () => {
  it('names fee schedules and condition libraries after the type that uses them', () => {
    const choices = choicesFromRows(ROWS)
    expect(choices.fee_schedule).toEqual([
      { key: 'bp-fees', label: 'Building permit fees' },
      { key: 'spare_fees', label: 'Spare fees', note: 'not in use yet' },
    ])
    expect(choices.condition_library).toEqual([
      { key: 'bp-conditions', label: 'Building permit conditions' },
    ])
  })

  it('marks the final inspection and prefers the draft name of an item', () => {
    const choices = choicesFromRows(ROWS)
    expect(choices.inspection_checklist).toEqual([
      { key: 'bp-final', label: 'Final inspection', note: 'closes the permit' },
    ])
    expect(choices.form).toEqual([
      { key: 'bp-form', label: 'Building permit application (new)', note: 'not in use yet' },
    ])
  })

  it('offers only number questions from the forms of types that use the fee schedule', () => {
    expect(numberQuestionsFor(ROWS, 'bp-fees')).toEqual([
      { key: 'deck_sq_ft', label: 'Deck square feet' },
    ])
    expect(numberQuestionsFor(ROWS, 'spare_fees')).toEqual([])
  })

  it('gives every listed item a name and sorts by it', () => {
    const listed: { key: string; label: string | null }[] = [
      { key: 'spare_fees', label: null },
      { key: 'bp-fees', label: null },
    ]
    const rows = namedKeyRows(listed, 'fee_schedule', choicesFromRows(ROWS))
    expect(rows.map((r) => r.label)).toEqual(['Building permit fees', 'Spare fees'])
  })
})
