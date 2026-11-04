import { describe, expect, it } from 'vitest'
import {
  addEntry,
  changeType,
  indexAfterMove,
  moveEntry,
  orderIssues,
  relabel,
  removeEntry,
  setKey,
} from '@/features/forms/formEdits'
import type { FormBody } from '@/features/forms/formSchema'

const BODY: FormBody = {
  key: 'f',
  label: 'F',
  fields: [
    {
      key: 'work_type',
      label: 'Work type',
      type: 'select',
      required: true,
      options: [
        { value: 'building', label: 'Building' },
        { value: 'demolition', label: 'Demolition' },
      ],
    },
    {
      key: 'demo_date',
      label: 'Demo date',
      type: 'date',
      required: false,
      showIf: { field: 'work_type', op: 'equals', value: 'demolition' },
      requireIf: {
        all: [
          { field: 'work_type', op: 'equals', value: 'demolition' },
          { field: 'other', op: 'is_true' },
        ],
      },
    },
  ],
}

const NONE: ReadonlySet<string> = new Set()

describe('addEntry', () => {
  it('adds a question after the given index with a generated unique key', () => {
    const added = addEntry(BODY, 'text', 0)
    expect(added.index).toBe(1)
    expect(added.body.fields[1]).toEqual({
      key: 'untitled_question',
      label: 'Untitled question',
      type: 'text',
      required: false,
    })
    const again = addEntry(added.body, 'text', 1)
    expect(again.body.fields[2]?.key).toBe('untitled_question_2')
  })

  it('gives a new dropdown two starting choices and a section a title', () => {
    const dropdown = addEntry(BODY, 'select', null)
    expect(dropdown.index).toBe(2)
    expect(dropdown.body.fields[2]?.options).toEqual([
      { value: 'choice_1', label: 'Choice 1' },
      { value: 'choice_2', label: 'Choice 2' },
    ])
    const section = addEntry(BODY, 'section', null).body.fields[2]
    expect(section).toEqual({
      key: 'new_section',
      label: 'New section',
      type: 'section',
      required: false,
    })
  })
})

describe('relabel', () => {
  it('a generated key follows the question text and conditions follow the key', () => {
    const body = relabel(BODY, 0, 'Work type', NONE)
    expect(body).toEqual(BODY)
    const renamed = relabel(BODY, 0, 'Kind of work', NONE)
    expect(renamed.fields[0]?.key).toBe('kind_of_work')
    expect(renamed.fields[1]?.showIf).toEqual({
      field: 'kind_of_work',
      op: 'equals',
      value: 'demolition',
    })
    expect(renamed.fields[1]?.requireIf).toEqual({
      all: [
        { field: 'kind_of_work', op: 'equals', value: 'demolition' },
        { field: 'other', op: 'is_true' },
      ],
    })
  })

  it('a key that a published version uses stays fixed', () => {
    const renamed = relabel(BODY, 0, 'Kind of work', new Set(['work_type']))
    expect(renamed.fields[0]?.key).toBe('work_type')
    expect(renamed.fields[0]?.label).toBe('Kind of work')
  })

  it('a hand-written key stays when the text changes', () => {
    const hand = setKey(BODY, 1, 'razing_on')
    expect(relabel(hand, 1, 'Demolition date', NONE).fields[1]?.key).toBe('razing_on')
  })

  it('the generated key stays unique against the other questions', () => {
    const renamed = relabel(BODY, 1, 'Work type', NONE)
    expect(renamed.fields[1]?.key).toBe('work_type_2')
  })
})

describe('removeEntry', () => {
  it('removes the question and the condition rules that used it', () => {
    const removed = removeEntry(BODY, 0)
    expect(removed.fields).toHaveLength(1)
    expect(removed.fields[0]?.showIf).toBeUndefined()
    expect(removed.fields[0]?.requireIf).toEqual({ all: [{ field: 'other', op: 'is_true' }] })
  })
})

describe('moveEntry and orderIssues', () => {
  it('moves a question and reports a rule that now points at a later question', () => {
    const moved = moveEntry(BODY, 1, 0)
    expect(moved.fields.map((f) => f.key)).toEqual(['demo_date', 'work_type'])
    expect(orderIssues(moved)).toEqual({
      0: 'A rule on this question uses a question that comes after it or no longer exists.',
    })
    expect(orderIssues(BODY)).toEqual({
      1: 'A rule on this question uses a question that comes after it or no longer exists.',
    })
    expect(moveEntry(BODY, 0, 5)).toEqual(BODY)
  })
})

describe('changeType', () => {
  it('adds starting choices for a dropdown and drops them for other types', () => {
    const text = changeType(BODY, 0, 'text')
    expect(text.fields[0]?.options).toBeUndefined()
    expect(text.fields[0]?.type).toBe('text')
    const back = changeType(text, 0, 'multiselect')
    expect(back.fields[0]?.options).toHaveLength(2)
  })

  it('keeps number limits only for number questions', () => {
    const numbered: FormBody = {
      ...BODY,
      fields: [{ key: 'n', label: 'N', type: 'integer', required: false, validation: { min: 1 } }],
    }
    expect(changeType(numbered, 0, 'decimal').fields[0]?.validation).toEqual({ min: 1 })
    expect(changeType(numbered, 0, 'text').fields[0]?.validation).toBeUndefined()
  })
})

describe('indexAfterMove', () => {
  it('keeps the selection on the same question after a move', () => {
    expect(indexAfterMove(2, 2, 0)).toBe(0)
    expect(indexAfterMove(0, 2, 0)).toBe(1)
    expect(indexAfterMove(1, 0, 2)).toBe(0)
    expect(indexAfterMove(3, 0, 2)).toBe(3)
    expect(indexAfterMove(null, 0, 2)).toBeNull()
  })
})
