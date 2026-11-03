import { describe, expect, it } from 'vitest'
import type { FeeComputation } from './computeFees'
import { feeRows } from './feeRows'

const INTAKE: FeeComputation = {
  complete: true,
  totalCents: 4500,
  lines: [
    {
      code: 'electrical',
      label: 'Electrical permit fee',
      due: 'at_intake',
      amount: { value: 4500, source: 'town_setting', replaced: null },
      explanation: ['Flat fee $45.00'],
    },
  ],
}

const WAIVED: FeeComputation = {
  complete: true,
  totalCents: 0,
  lines: [
    {
      code: 'building',
      label: 'Building permit fee',
      due: 'at_approval',
      amount: {
        value: 0,
        source: 'manual_override',
        replaced: { value: 45000, source: 'town_setting' },
      },
      explanation: ['Waived'],
    },
  ],
}

const EMPTY: FeeComputation = { complete: true, totalCents: 0, lines: [] }

describe('fee rows', () => {
  it('joins each assessed line to what was paid and what is still due', () => {
    const rows = feeRows(
      [{ id: 'a1', stage: 'at_intake', computation: INTAKE }],
      [
        {
          stage: 'at_intake',
          feeCode: 'electrical',
          label: 'Electrical permit fee',
          feeAssessmentId: 'a1',
          assessedCents: 4500,
          paidCents: 1000,
          dueCents: 3500,
        },
      ],
      null,
    )
    expect(rows).toEqual([
      {
        key: 'a1-electrical',
        label: 'Electrical permit fee',
        stageText: null,
        assessedText: '$45.00',
        paidCents: 1000,
        dueCents: 3500,
        explanation: ['Flat fee $45.00'],
        preview: false,
      },
    ])
  })

  it('skips assessments with no lines and names the stage only when stages differ', () => {
    const rows = feeRows(
      [
        { id: 'a1', stage: 'at_intake', computation: INTAKE },
        { id: 'a2', stage: 'at_notice', computation: EMPTY },
        { id: 'a3', stage: 'at_approval', computation: WAIVED },
      ],
      null,
      null,
    )
    expect(rows.map((r) => [r.label, r.stageText, r.assessedText, r.paidCents])).toEqual([
      ['Electrical permit fee', 'Due at intake', '$45.00', null],
      ['Building permit fee', 'Due at approval', 'Waived (was $450.00)', null],
    ])
  })

  it('adds the preview of the next assessment as rows that are not yet due', () => {
    const rows = feeRows([{ id: 'a1', stage: 'at_intake', computation: INTAKE }], [], WAIVED)
    expect(rows.at(-1)).toMatchObject({
      label: 'Building permit fee',
      stageText: 'Next assessment, not yet due',
      preview: true,
      paidCents: null,
      dueCents: null,
    })
  })
})
