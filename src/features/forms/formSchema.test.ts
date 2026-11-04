import { describe, expect, it } from 'vitest'
import { FormBodySchema, questionsOf } from '@/features/forms/formSchema'

const base = { key: 'f', label: 'F' }

describe('form schema', () => {
  it('condition referencing a later field fails form publish', () => {
    const body = {
      ...base,
      fields: [
        {
          key: 'a',
          label: 'A',
          type: 'text',
          required: false,
          showIf: { field: 'b', op: 'is_true' },
        },
        { key: 'b', label: 'B', type: 'checkbox', required: false },
      ],
    }
    expect(FormBodySchema.safeParse(body).success).toBe(false)
  })

  it('duplicate field keys are rejected', () => {
    const body = {
      ...base,
      fields: [
        { key: 'a', label: 'A', type: 'text', required: false },
        { key: 'a', label: 'A2', type: 'text', required: false },
      ],
    }
    expect(FormBodySchema.safeParse(body).success).toBe(false)
  })

  it('select without options is rejected', () => {
    const body = { ...base, fields: [{ key: 'a', label: 'A', type: 'select', required: false }] }
    expect(FormBodySchema.safeParse(body).success).toBe(false)
  })

  it('a condition on an earlier field is accepted', () => {
    const body = {
      ...base,
      fields: [
        { key: 'b', label: 'B', type: 'checkbox', required: false },
        {
          key: 'a',
          label: 'A',
          type: 'text',
          required: false,
          showIf: { all: [{ field: 'b', op: 'is_true' }] },
        },
      ],
    }
    expect(FormBodySchema.safeParse(body).success).toBe(true)
  })

  it('a section entry with a title and description is accepted', () => {
    const body = {
      ...base,
      fields: [
        {
          key: 'about',
          label: 'About the work',
          help: 'Tell us',
          type: 'section',
          required: false,
        },
        { key: 'a', label: 'A', type: 'text', required: false },
      ],
    }
    expect(FormBodySchema.safeParse(body).success).toBe(true)
  })

  it('a section cannot be required, carry a fact or choices, or have conditions', () => {
    const section = { key: 's', label: 'S', type: 'section' }
    const bad = [
      { ...section, required: true },
      { ...section, required: false, fact: 'classification' },
      { ...section, required: false, options: [{ value: 'x', label: 'X' }] },
      { ...section, required: false, showIf: { field: 'a', op: 'is_true' } },
    ]
    for (const entry of bad) {
      const body = {
        ...base,
        fields: [{ key: 'a', label: 'A', type: 'checkbox', required: false }, entry],
      }
      expect(FormBodySchema.safeParse(body).success).toBe(false)
    }
  })

  it('a condition cannot point at a section', () => {
    const body = {
      ...base,
      fields: [
        { key: 's', label: 'S', type: 'section', required: false },
        {
          key: 'a',
          label: 'A',
          type: 'text',
          required: false,
          showIf: { field: 's', op: 'is_true' },
        },
      ],
    }
    expect(FormBodySchema.safeParse(body).success).toBe(false)
  })

  it('questionsOf leaves out sections and keeps question order', () => {
    const fields = [
      { key: 's', label: 'S', type: 'section' as const, required: false },
      { key: 'a', label: 'A', type: 'text' as const, required: false },
      { key: 'b', label: 'B', type: 'checkbox' as const, required: false },
    ]
    expect(questionsOf(fields).map((f) => f.key)).toEqual(['a', 'b'])
  })
})
