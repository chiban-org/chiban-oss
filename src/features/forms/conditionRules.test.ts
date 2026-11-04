import { describe, expect, it } from 'vitest'
import type { Condition } from '@/features/forms/condition'
import {
  changeOperator,
  conditionOf,
  conditionSources,
  describeCondition,
  operatorsFor,
  retarget,
  ruleSetOf,
} from '@/features/forms/conditionRules'
import type { FormField } from '@/features/forms/formSchema'

const SELECT: FormField = {
  key: 'use',
  label: 'Use',
  type: 'select',
  required: true,
  options: [
    { value: 'residential', label: 'Residential' },
    { value: 'commercial', label: 'Commercial' },
  ],
}
const YES_NO: FormField = { key: 'late', label: 'Started early', type: 'checkbox', required: false }
const COUNT: FormField = { key: 'units', label: 'Units', type: 'integer', required: false }

describe('condition builder round trips', () => {
  const cases: [string, Condition][] = [
    ['a single rule', { field: 'use', op: 'equals', value: 'residential' }],
    ['all of one rule', { all: [{ field: 'late', op: 'is_true' }] }],
    [
      'all of several rules',
      {
        all: [
          { field: 'use', op: 'in', value: ['residential', 'commercial'] },
          { field: 'units', op: 'gt', value: 2 },
        ],
      },
    ],
    [
      'any of several rules',
      {
        any: [
          { field: 'late', op: 'is_false' },
          { field: 'units', op: 'lt', value: 10 },
        ],
      },
    ],
  ]
  it.each(cases)('%s comes back unchanged', (_name, condition) => {
    const set = ruleSetOf(condition)
    expect(set).not.toBeNull()
    if (set !== null) expect(conditionOf(set)).toEqual(condition)
  })

  it('no condition is no rule set, and an empty rule set is no condition', () => {
    expect(ruleSetOf(undefined)).toBeNull()
    expect(conditionOf({ join: 'all', rules: [] })).toBeUndefined()
  })

  it('a second rule on a single rule becomes all of them', () => {
    const condition = conditionOf({
      join: 'leaf',
      rules: [
        { field: 'late', op: 'is_true' },
        { field: 'units', op: 'gt', value: 1 },
      ],
    })
    expect(condition).toEqual({
      all: [
        { field: 'late', op: 'is_true' },
        { field: 'units', op: 'gt', value: 1 },
      ],
    })
  })
})

describe('operators and values', () => {
  it('offers operators that suit the question type', () => {
    expect(operatorsFor('select')).toEqual(['equals', 'not_equals', 'in'])
    expect(operatorsFor('checkbox')).toEqual(['is_true', 'is_false'])
    expect(operatorsFor('integer')).toEqual(['equals', 'not_equals', 'gt', 'lt'])
    expect(operatorsFor('text')).toEqual(['equals', 'not_equals'])
  })

  it('pointing a rule at another question picks a fitting operator and value', () => {
    expect(retarget(SELECT)).toEqual({ field: 'use', op: 'equals', value: 'residential' })
    expect(retarget(YES_NO)).toEqual({ field: 'late', op: 'is_true' })
    expect(retarget(COUNT)).toEqual({ field: 'units', op: 'equals', value: '' })
  })

  it('changing the operator keeps what it can of the value', () => {
    const leaf = { field: 'use', op: 'equals' as const, value: 'residential' }
    expect(changeOperator(leaf, 'in')).toEqual({ field: 'use', op: 'in', value: ['residential'] })
    expect(changeOperator({ field: 'use', op: 'in', value: ['commercial'] }, 'not_equals')).toEqual(
      { field: 'use', op: 'not_equals', value: 'commercial' },
    )
    expect(changeOperator({ field: 'units', op: 'equals', value: '3' }, 'gt')).toEqual({
      field: 'units',
      op: 'gt',
      value: 3,
    })
    expect(changeOperator({ field: 'late', op: 'is_true' }, 'is_false')).toEqual({
      field: 'late',
      op: 'is_false',
    })
  })

  it('only earlier questions that can be tested are offered', () => {
    const multi: FormField = { ...SELECT, key: 'many', type: 'multiselect' }
    const section: FormField = { key: 's', label: 'S', type: 'section', required: false }
    const fields = [SELECT, section, multi, YES_NO, COUNT]
    expect(conditionSources(fields, 4).map((f) => f.key)).toEqual(['use', 'late'])
  })

  it('describes a rule in plain words for the question card', () => {
    const fields = [SELECT, YES_NO, COUNT]
    expect(describeCondition({ field: 'use', op: 'equals', value: 'residential' }, fields)).toBe(
      'Use is Residential',
    )
    expect(
      describeCondition(
        {
          any: [
            { field: 'late', op: 'is_true' },
            { field: 'units', op: 'gt', value: 2 },
          ],
        },
        fields,
      ),
    ).toBe('Started early is yes, or Units is more than 2')
    expect(
      describeCondition({ field: 'use', op: 'in', value: ['residential', 'commercial'] }, fields),
    ).toBe('Use is any of Residential, Commercial')
  })
})
