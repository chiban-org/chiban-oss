// @vitest-environment jsdom
import { NH_STARTERS } from '@packs/nh/starters'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import { exampleCents } from '@/components/config/fees/FeeExample'
import { computeFees } from '@/features/fees/computeFees'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'

afterEach(cleanup)

const building = NH_STARTERS.find((s) => s.id === 'nh.starter.building')?.feeSchedule
if (building === undefined) throw new Error('missing starter')
const line = building.lines[0]
if (line === undefined) throw new Error('missing line')

const QUESTIONS = [
  { key: 'finished_sq_ft', label: 'Finished square feet' },
  { key: 'unfinished_sq_ft', label: 'Unfinished square feet' },
  { key: 'commercial_sq_ft', label: 'Commercial square feet' },
]

const context = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  boards: [],
  reviewers: [],
  townRules: {},
  feeQuestions: QUESTIONS,
}

function renderEditor(body: FeeScheduleBody, onChange = vi.fn()) {
  render(
    <EditorContextProvider value={context}>
      <FeeLinesEditor body={body} onChange={onChange} errors={{}} />
    </EditorContextProvider>,
  )
  return onChange
}

describe('worked fee example', () => {
  it('charges what the real fee calculation charges', () => {
    const samples = new Map([['field:finished_sq_ft', 1200]])
    const real = computeFees(
      { key: 'x', lines: [line] },
      {
        values: { finished_sq_ft: 1200, after_the_fact: false },
        facts: { classification: null, dwellingUnits: null, afterTheFact: false },
        counts: { abutters: { state: 'unknown' } },
        stage: line.due,
        overrides: [],
      },
    )
    expect(exampleCents(line, samples, false)).toBe(real.totalCents)
    expect(exampleCents(line, samples, true)).toBe((real.totalCents ?? 0) * 2)
  })

  it('reads as a sentence with the question names and updates as the sample changes', () => {
    renderEditor({ ...building, lines: [line] })
    const example = document.querySelector('[data-fee-example]') as HTMLElement
    expect(example.textContent).toContain(
      'For Finished square feet of 1,000 and Unfinished square feet of 1,000 and Commercial square feet of 1,000, this fee is $950.00.',
    )
    fireEvent.change(screen.getByLabelText('Try Unfinished square feet'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Try Commercial square feet'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Try Finished square feet'), {
      target: { value: '1200' },
    })
    expect(example.textContent).toContain('this fee is $420.00.')
    fireEvent.click(screen.getByLabelText('Try with work started before the permit'))
    expect(example.textContent).toContain(
      'with work started before the permit, this fee is $840.00.',
    )
  })

  it('picks the counted answer by question name and stores the question key', () => {
    const onChange = renderEditor({ ...building, lines: [line] })
    const pickers = screen.getAllByLabelText<HTMLSelectElement>('Count')
    expect(pickers[0]?.selectedOptions[0]?.textContent).toBe('Finished square feet')
    fireEvent.change(pickers[0] as HTMLSelectElement, {
      target: { value: 'field:commercial_sq_ft' },
    })
    const expr = onChange.mock.calls[0]?.[0].lines[0].expr
    expect(JSON.stringify(expr)).toContain('"field":"commercial_sq_ft"')
  })

  it('lets a fee count abutters on the notice list', () => {
    const onChange = renderEditor({
      key: 'f',
      lines: [
        {
          code: 'mail',
          label: 'Mailing',
          due: 'at_notice',
          expr: {
            op: 'per_unit',
            source: { kind: 'field', field: 'finished_sq_ft' },
            centsPerUnit: 100,
          },
        },
      ],
    })
    fireEvent.change(screen.getByLabelText('Count'), {
      target: { value: 'count:abutters_on_issued_list' },
    })
    expect(onChange.mock.calls[0]?.[0].lines[0].expr).toEqual({
      op: 'per_unit',
      source: { kind: 'count_of', what: 'abutters_on_issued_list' },
      centsPerUnit: 100,
    })
  })

  it('leaves the stored fee alone when nothing is edited', () => {
    const onChange = renderEditor(building)
    expect(onChange).not.toHaveBeenCalled()
  })
})
