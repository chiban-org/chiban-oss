import { describe, expect, it } from 'vitest'
import { type FormBody, FormBodySchema } from '@/features/forms/formSchema'
import { validateSubmission } from '@/features/forms/validateSubmission'

const FORM: FormBody = FormBodySchema.parse({
  key: 'bp',
  label: 'Building permit',
  fields: [
    {
      key: 'classification',
      label: 'Classification',
      type: 'select',
      required: true,
      fact: 'classification',
      options: [
        { value: 'residential', label: 'Residential' },
        { value: 'nonresidential', label: 'Nonresidential' },
      ],
    },
    {
      key: 'dwelling_units',
      label: 'Dwelling units',
      type: 'integer',
      required: false,
      fact: 'dwellingUnits',
      showIf: { field: 'classification', op: 'equals', value: 'residential' },
      requireIf: { field: 'classification', op: 'equals', value: 'residential' },
    },
    {
      key: 'finished_sq_ft',
      label: 'Finished sq ft',
      type: 'decimal',
      required: false,
      validation: { min: 0, max: 10000 },
    },
    {
      key: 'after_the_fact',
      label: 'After the fact',
      type: 'checkbox',
      required: false,
      fact: 'afterTheFact',
      staffOnly: true,
    },
  ],
})

describe('validateSubmission', () => {
  it('hidden field value is dropped', () => {
    const r = validateSubmission(
      FORM,
      { classification: 'nonresidential', dwelling_units: 4 },
      { asStaff: false },
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect('dwelling_units' in r.value.values).toBe(false)
  })

  it('dwelling units required only when classification is residential', () => {
    const res = validateSubmission(FORM, { classification: 'residential' }, { asStaff: false })
    expect(res).toEqual({ ok: false, error: [{ field: 'dwelling_units', code: 'required' }] })
    expect(
      validateSubmission(FORM, { classification: 'nonresidential' }, { asStaff: false }).ok,
    ).toBe(true)
  })

  it('integer 2.5 is a type error', () => {
    const r = validateSubmission(
      FORM,
      { classification: 'residential', dwelling_units: 2.5 },
      { asStaff: false },
    )
    expect(r).toEqual({ ok: false, error: [{ field: 'dwelling_units', code: 'type' }] })
  })

  it('max 10000 refuses 10001', () => {
    const base = { classification: 'nonresidential' }
    const over = validateSubmission(FORM, { ...base, finished_sq_ft: '10001' }, { asStaff: false })
    expect(over).toEqual({ ok: false, error: [{ field: 'finished_sq_ft', code: 'max' }] })
    expect(
      validateSubmission(FORM, { ...base, finished_sq_ft: '10000' }, { asStaff: false }).ok,
    ).toBe(true)
  })

  it('select outside options is option error', () => {
    const r = validateSubmission(FORM, { classification: 'industrial' }, { asStaff: false })
    expect(r).toEqual({ ok: false, error: [{ field: 'classification', code: 'option' }] })
  })

  it('applicant setting after_the_fact gets staff_only', () => {
    const raw = { classification: 'nonresidential', after_the_fact: true }
    expect(validateSubmission(FORM, raw, { asStaff: false })).toEqual({
      ok: false,
      error: [{ field: 'after_the_fact', code: 'staff_only' }],
    })
    expect(validateSubmission(FORM, raw, { asStaff: true }).ok).toBe(true)
  })

  it('facts are extracted from fields tagged fact', () => {
    const r = validateSubmission(
      FORM,
      { classification: 'residential', dwelling_units: 12, after_the_fact: true },
      { asStaff: true },
    )
    expect(r.ok && r.value.facts).toEqual({
      classification: 'residential',
      dwellingUnits: 12,
      afterTheFact: true,
    })
  })

  it('decimal values are kept as decimal strings', () => {
    const r = validateSubmission(
      FORM,
      { classification: 'nonresidential', finished_sq_ft: 333.33 },
      { asStaff: false },
    )
    expect(r.ok && r.value.values.finished_sq_ft).toBe('333.33')
  })

  it('a section entry is skipped and never yields a value or an error', () => {
    const withSection: FormBody = {
      ...FORM,
      fields: [
        { key: 'about', label: 'About the project', type: 'section', required: false },
        ...FORM.fields,
      ],
    }
    const r = validateSubmission(
      withSection,
      { about: 'typed anyway', classification: 'nonresidential' },
      { asStaff: false },
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect('about' in r.value.values).toBe(false)
  })

  it('a whitespace-only answer to a required text question is refused as missing', () => {
    const form: FormBody = FormBodySchema.parse({
      key: 'alarm',
      label: 'Alarm',
      fields: [
        { key: 'description', label: 'Description', type: 'textarea', required: true },
        { key: 'contact', label: 'Contact', type: 'text', required: false },
      ],
    })
    const r = validateSubmission(form, { description: '     ', contact: '   ' }, { asStaff: false })
    expect(r).toEqual({ ok: false, error: [{ field: 'description', code: 'required' }] })
  })

  it('a whitespace-only answer to an optional text question is left out', () => {
    const form: FormBody = FormBodySchema.parse({
      key: 'alarm',
      label: 'Alarm',
      fields: [{ key: 'contact', label: 'Contact', type: 'text', required: false }],
    })
    const r = validateSubmission(form, { contact: '   ' }, { asStaff: false })
    expect(r.ok && r.value.values).toEqual({})
  })
})
