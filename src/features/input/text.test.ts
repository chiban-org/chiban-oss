import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  checkbox,
  choice,
  emailAddress,
  optionalPhone,
  optionalText,
  phone,
  recordId,
  requiredText,
} from '@/features/input/schemas'

function verdict(schema: z.ZodType, raw: unknown) {
  const parsed = schema.safeParse(raw)
  return parsed.success ? { value: parsed.data } : { message: parsed.error.issues[0]?.message }
}

describe('requiredText', () => {
  const title = requiredText('a title', { max: 10 })

  it('trims surrounding whitespace from the value', () => {
    expect(verdict(title, '  Minutes ')).toEqual({ value: 'Minutes' })
  })

  it('refuses whitespace only, empty and missing values with the noun the action names', () => {
    for (const raw of ['   ', '', undefined, null, ['a', 'b']])
      expect(verdict(title, raw)).toEqual({ message: 'Enter a title.' })
  })

  it('refuses text over the max length counted after trimming', () => {
    expect(verdict(title, ` ${'x'.repeat(10)} `)).toEqual({ value: 'x'.repeat(10) })
    expect(verdict(title, 'x'.repeat(11))).toEqual({
      message: 'Enter a title of 10 characters or fewer.',
    })
  })

  it('defaults the max length to 200 characters', () => {
    expect(verdict(requiredText('a title'), 'x'.repeat(200))).toEqual({ value: 'x'.repeat(200) })
    expect(verdict(requiredText('a title'), 'x'.repeat(201))).toEqual({
      message: 'Enter a title of 200 characters or fewer.',
    })
  })

  it('refuses text under a min length with the minimum named', () => {
    const reason = requiredText('a reason', { min: 10 })
    expect(verdict(reason, '  short    ')).toEqual({
      message: 'Enter a reason of at least 10 characters.',
    })
    expect(verdict(reason, 'long enough')).toEqual({ value: 'long enough' })
  })
})

describe('optionalText', () => {
  const note = optionalText('a note', { max: 5 })

  it('turns blank, whitespace only and missing values into null', () => {
    for (const raw of ['', '   ', undefined]) expect(verdict(note, raw)).toEqual({ value: null })
  })

  it('trims a value and still applies the max length', () => {
    expect(verdict(note, ' ok ')).toEqual({ value: 'ok' })
    expect(verdict(note, 'toolong')).toEqual({ message: 'Enter a note of 5 characters or fewer.' })
  })
})

describe('emailAddress', () => {
  const email = emailAddress('an email address')

  it('accepts a trimmed address and refuses blank or malformed ones', () => {
    expect(verdict(email, ' avery@alderpond.example ')).toEqual({
      value: 'avery@alderpond.example',
    })
    expect(verdict(email, '  ')).toEqual({ message: 'Enter an email address.' })
    for (const raw of ['notemail', 'a@b', 'a b@alderpond.example'])
      expect(verdict(email, raw)).toEqual({
        message: 'Enter an email address like name@example.com.',
      })
  })
})

describe('phone', () => {
  const contactPhone = phone('a contact phone number')

  it('accepts 7 to 15 digits with common punctuation and keeps what was typed', () => {
    expect(verdict(contactPhone, ' (603) 555-0142 ')).toEqual({ value: '(603) 555-0142' })
    expect(verdict(contactPhone, '555.0142')).toEqual({ value: '555.0142' })
    expect(verdict(contactPhone, '+1 603 555 0142')).toEqual({ value: '+1 603 555 0142' })
  })

  it('refuses letters, too few digits and too many digits', () => {
    for (const raw of ['abc', '555-014', '1'.repeat(16), '603-555-0142 x12'])
      expect(verdict(contactPhone, raw)).toEqual({
        message: 'Enter a contact phone number with 7 to 15 digits.',
      })
    expect(verdict(contactPhone, ' ')).toEqual({ message: 'Enter a contact phone number.' })
  })

  it('has an optional form that turns blank into null', () => {
    expect(verdict(optionalPhone('a phone number'), ' ')).toEqual({ value: null })
    expect(verdict(optionalPhone('a phone number'), 'abc')).toEqual({
      message: 'Enter a phone number with 7 to 15 digits.',
    })
  })
})

describe('choice', () => {
  const kind = choice('a kind of adjustment', ['extension', 'waiver'] as const)

  it('accepts only the listed values', () => {
    expect(verdict(kind, 'waiver')).toEqual({ value: 'waiver' })
    for (const raw of ['', 'statutory_exception', undefined])
      expect(verdict(kind, raw)).toEqual({ message: 'Choose a kind of adjustment.' })
  })
})

describe('recordId', () => {
  it('accepts a uuid and refuses anything else', () => {
    const id = recordId('a clock')
    expect(verdict(id, '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f')).toEqual({
      value: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
    })
    expect(verdict(id, 'not-a-uuid')).toEqual({ message: 'Choose a clock.' })
  })
})

describe('checkbox', () => {
  it('is true only for a ticked box', () => {
    expect(verdict(checkbox(), 'on')).toEqual({ value: true })
    expect(verdict(checkbox(), undefined)).toEqual({ value: false })
    expect(verdict(checkbox(), '')).toEqual({ value: false })
  })
})
