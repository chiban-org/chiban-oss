import { describe, expect, it } from 'vitest'
import { FormBodySchema } from '@/features/forms/formSchema'

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
})
