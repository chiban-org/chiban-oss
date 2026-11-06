import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  checkbox,
  civilDate,
  optionalText,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))

const { formValues, parseForm, refuseField, refusedInput } = await import('@/server/formInput')

function formOf(entries: [string, string][]): FormData {
  const form = new FormData()
  for (const [name, value] of entries) form.append(name, value)
  return form
}

const agendaItem = z.object({
  title: requiredText('a title', { max: 20 }),
  days: wholeNumber('the number of days', { min: 1, max: 365 }),
})

describe('formValues', () => {
  it('keeps single values as strings, repeated names as arrays, and drops the csrf and check fields', () => {
    const form = formOf([
      ['csrf_token', 'tok'],
      ['chiban_check_only', '1'],
      ['title', 'Minutes'],
      ['documentId', 'a'],
      ['documentId', 'b'],
    ])
    expect(formValues(form)).toEqual({ title: 'Minutes', documentId: ['a', 'b'] })
  })
})

describe('parseForm', () => {
  it('returns the parsed values for a valid form', () => {
    expect(
      parseForm(
        agendaItem,
        formOf([
          ['title', ' Old business '],
          ['days', '30'],
        ]),
      ),
    ).toEqual({
      ok: true,
      value: { title: 'Old business', days: 30 },
    })
  })

  it('returns a refusal keyed by field with every message in the summary', () => {
    expect(
      parseForm(
        agendaItem,
        formOf([
          ['title', '   '],
          ['days', '999999'],
        ]),
      ),
    ).toEqual({
      ok: false,
      error: {
        ok: false,
        error: 'Enter a title. Enter the number of days as a whole number from 1 to 365.',
        fieldErrors: {
          title: 'Enter a title.',
          days: 'Enter the number of days as a whole number from 1 to 365.',
        },
      },
    })
  })
})

describe('parseForm with fields the browser did not send', () => {
  it('reads an absent optional field as null, an unticked box as false and an absent required field as missing', () => {
    const schema = z.object({
      title: requiredText('a title'),
      note: optionalText('a note'),
      consent: checkbox(),
    })
    expect(parseForm(schema, formOf([['title', 'Minutes']]))).toEqual({
      ok: true,
      value: { title: 'Minutes', note: null, consent: false },
    })
    expect(parseForm(schema, formOf([]))).toEqual({
      ok: false,
      error: { ok: false, error: 'Enter a title.', fieldErrors: { title: 'Enter a title.' } },
    })
  })
})

describe('refusedInput', () => {
  it('keeps the first message per field and folds pathless issues into the summary only', () => {
    const schema = z
      .object({ observedOn: civilDate('the observed date') })
      .superRefine((_, ctx) => ctx.addIssue({ code: 'custom', message: 'Pick one parcel.' }))
    const parsed = schema.safeParse({ observedOn: '2020-01-01' })
    if (parsed.success) throw new Error('expected a refusal')
    expect(refusedInput(parsed.error)).toEqual({
      ok: false,
      error: 'Pick one parcel.',
      fieldErrors: {},
    })
  })

  it('says the same message once in the summary even when two fields share it', () => {
    const schema = z.object({ a: requiredText('a value'), b: requiredText('a value') })
    const parsed = schema.safeParse({})
    if (parsed.success) throw new Error('expected a refusal')
    expect(refusedInput(parsed.error)).toEqual({
      ok: false,
      error: 'Enter a value.',
      fieldErrors: { a: 'Enter a value.', b: 'Enter a value.' },
    })
  })

  it('gives a zod default issue a plain message instead of zod copy', () => {
    const parsed = z.object({ kind: z.enum(['a', 'b']) }).safeParse({ kind: 'c' })
    if (parsed.success) throw new Error('expected a refusal')
    expect(refusedInput(parsed.error)).toEqual({
      ok: false,
      error: 'Check this field.',
      fieldErrors: { kind: 'Check this field.' },
    })
  })
})

describe('refuseField', () => {
  it('names one field with the message as the summary', () => {
    expect(
      refuseField('applicantConsent', "This extension needs the applicant's consent."),
    ).toEqual({
      ok: false,
      error: "This extension needs the applicant's consent.",
      fieldErrors: { applicantConsent: "This extension needs the applicant's consent." },
    })
  })
})
