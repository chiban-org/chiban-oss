// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import type { EditorContext } from '@/features/config/editorContext'
import { AFTER_THE_FACT_FIELD } from '@/features/fees/feeEditorModel'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'

afterEach(cleanup)

const BASE_CONTEXT: EditorContext = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  boards: [],
  reviewers: [],
  townRules: {},
}

const TOWN_SETS_LINE = {
  code: 'permit',
  label: 'Building permit fee',
  due: 'at_approval' as const,
  expr: { op: 'flat' as const, cents: 0 },
  townSets: true as const,
}

const BODY: FeeScheduleBody = {
  key: 'bp-fees',
  lines: [
    TOWN_SETS_LINE,
    { code: 'plain', label: 'Plan review', due: 'at_approval', expr: { op: 'flat', cents: 0 } },
  ],
}

function show(body: FeeScheduleBody, onChange = vi.fn(), context: Partial<EditorContext> = {}) {
  render(
    <EditorContextProvider value={{ ...BASE_CONTEXT, ...context }}>
      <FeeLinesEditor body={body} onChange={onChange} errors={{}} />
    </EditorContextProvider>,
  )
  return onChange
}

describe('fee lines the town sets', () => {
  it('marks a line the town sets with a Set your fee chip and no other line', () => {
    show(BODY)
    expect(screen.getAllByText('Set your fee')).toHaveLength(1)
  })

  it('keeps the town sets mark when a line is edited', () => {
    const onChange = show(BODY)
    fireEvent.change(screen.getAllByLabelText(/^Amount/)[0] as HTMLElement, {
      target: { value: '45' },
    })
    expect(onChange.mock.calls[0]?.[0].lines[0]).toMatchObject({ code: 'permit', townSets: true })
  })

  it('says which form has no number questions when a type uses the schedule', () => {
    show(BODY, vi.fn(), { feeUsedBy: ['Building permit'] })
    expect(
      screen.getByText('The Building permit form has no number questions to count.'),
    ).toBeTruthy()
  })

  it('keeps the no type uses it sentence when none does', () => {
    show(BODY, vi.fn(), { feeUsedBy: [] })
    expect(screen.getByText(/No application type uses this fee schedule yet/)).toBeTruthy()
  })

  it('tells staff the work started multiplier follows the Work started tick on the record', () => {
    const body = {
      ...BODY,
      lines: [
        {
          ...TOWN_SETS_LINE,
          expr: {
            op: 'conditional_multiplier' as const,
            when: { field: AFTER_THE_FACT_FIELD, op: 'is_true' as const },
            factor: 2,
            of: { op: 'flat' as const, cents: 100 },
          },
        },
      ],
    }
    show(body)
    expect(
      screen.getByText(
        'A value of 2 doubles the fee. It applies when staff tick Work started before permit on the record.',
      ),
    ).toBeTruthy()
  })
})
