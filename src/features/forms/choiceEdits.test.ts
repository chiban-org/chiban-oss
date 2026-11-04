import { describe, expect, it } from 'vitest'
import { addChoice, moveChoice, relabelChoice, removeChoice } from '@/features/forms/choiceEdits'
import type { FormBody } from '@/features/forms/formSchema'

const BODY: FormBody = {
  key: 'f',
  label: 'F',
  fields: [
    {
      key: 'use',
      label: 'Use',
      type: 'select',
      required: true,
      options: [
        { value: 'choice_1', label: 'Choice 1' },
        { value: 'farm', label: 'Farm stand' },
      ],
    },
    {
      key: 'acres',
      label: 'Acres',
      type: 'decimal',
      required: false,
      showIf: { field: 'use', op: 'in', value: ['choice_1', 'farm'] },
    },
  ],
}
const NONE: ReadonlySet<string> = new Set()

function options(body: FormBody) {
  return body.fields[0]?.options
}

describe('choice edits', () => {
  it('adds a choice with a fresh value', () => {
    expect(options(addChoice(BODY, 0))?.[2]).toEqual({ value: 'choice_3', label: 'Choice 3' })
  })

  it('a generated value follows the choice text, and rules that test it follow too', () => {
    const renamed = relabelChoice(BODY, { index: 0, choice: 0 }, 'Home', NONE)
    expect(options(renamed)?.[0]).toEqual({ value: 'home', label: 'Home' })
    expect(renamed.fields[1]?.showIf).toEqual({ field: 'use', op: 'in', value: ['home', 'farm'] })
  })

  it('a hand-made value or a published question keeps its value', () => {
    expect(options(relabelChoice(BODY, { index: 0, choice: 1 }, 'Farm', NONE))?.[1]).toEqual({
      value: 'farm',
      label: 'Farm',
    })
    expect(
      options(relabelChoice(BODY, { index: 0, choice: 0 }, 'Home', new Set(['use'])))?.[0],
    ).toEqual({
      value: 'choice_1',
      label: 'Home',
    })
  })

  it('removes and reorders choices', () => {
    expect(options(removeChoice(BODY, 0, 0))).toEqual([{ value: 'farm', label: 'Farm stand' }])
    expect(options(moveChoice(BODY, 0, 1, -1))?.map((o) => o.value)).toEqual(['farm', 'choice_1'])
    expect(moveChoice(BODY, 0, 0, -1)).toEqual(BODY)
  })
})
