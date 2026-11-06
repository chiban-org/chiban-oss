import { describe, expect, it } from 'vitest'
import { dollarsToCents, parseQuickIssue } from '@/features/counter/parseQuickIssue'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.set(k, v)
  return data
}

const BASE = {
  parcelId: '00000000-0000-4000-8000-000000000001',
  typeKey: 'EL',
  contractorName: 'Pat Contractor',
  licenseNumber: 'EL-1',
  licenseType: 'Electrician',
  licenseResult: 'active',
  method: 'cash',
}

describe('dollarsToCents', () => {
  it.each([
    ['50', 5000],
    ['50.5', 5050],
    ['50.05', 5005],
    ['0.99', 99],
  ])('%s is %s cents', (text, cents) => {
    expect(dollarsToCents(text)).toBe(cents)
  })

  it.each(['', 'abc', '1.234', '-5', '1,000'])('%s is not an amount', (text) => {
    expect(dollarsToCents(text)).toBeNull()
  })
})

describe('parseQuickIssue', () => {
  it('builds cash input with tendered cents and drops empty work values', () => {
    const parsed = parseQuickIssue(
      form({ ...BASE, tendered: '50.00', 'value.description': 'Panel', 'value.service_amps': '' }),
    )
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        applicationTypeKey: 'EL',
        values: { description: 'Panel' },
        payerName: 'Pat Contractor',
        payment: { method: 'cash', tenderedCents: 5000 },
        license: { number: 'EL-1', type: 'Electrician', result: 'active' },
      },
    })
  })

  it('a blank tendered amount means exact change', () => {
    const parsed = parseQuickIssue(form({ ...BASE, tendered: '' }))
    expect(parsed.ok && parsed.value.payment).toEqual({ method: 'cash' })
  })

  it('a checked checkbox is true', () => {
    const parsed = parseQuickIssue(form({ ...BASE, 'value.after_the_fact': 'on' }))
    expect(parsed.ok && parsed.value.values).toEqual({ after_the_fact: true })
  })

  it('check and card methods', () => {
    const check = parseQuickIssue(form({ ...BASE, method: 'check', checkNumber: ' 55 ' }))
    expect(check.ok && check.value.payment).toEqual({ method: 'check', checkNumber: '55' })
    const card = parseQuickIssue(form({ ...BASE, method: 'card' }))
    expect(card.ok && card.value.payment).toEqual({ method: 'card' })
  })

  it.each([
    [{ parcelId: 'x' }, 'parcelId', 'Choose a parcel.'],
    [{ licenseResult: 'maybe' }, 'licenseResult', 'Choose a result.'],
    [{ licenseResult: '' }, 'licenseResult', 'Fill in all the license fields.'],
    [{ licenseNumber: '' }, 'licenseNumber', 'Fill in all the license fields.'],
    [{ licenseType: '' }, 'licenseType', 'Fill in all the license fields.'],
    [{ method: 'barter' }, 'method', 'Choose a payment method.'],
    [{ tendered: 'lots' }, 'tendered', 'Enter the cash tendered in dollars and cents, like 25.00.'],
    [{ contractorName: '' }, 'contractorName', 'Enter the contractor name.'],
    [{ contractorName: '   ' }, 'contractorName', 'Enter the contractor name.'],
    [
      { contractorEmail: 'nope' },
      'contractorEmail',
      'Enter the contractor email like name@example.com.',
    ],
    [{ method: 'check', checkNumber: '' }, 'checkNumber', 'Enter the check number.'],
  ])('refuses %j beside %s', (bad, field, message) => {
    const parsed = parseQuickIssue(form({ ...BASE, ...bad }))
    expect(parsed).toMatchObject({ ok: false, error: { fieldErrors: { [field]: message } } })
  })

  it('takes no license when every license field is blank', () => {
    const parsed = parseQuickIssue(
      form({ ...BASE, licenseNumber: '', licenseType: '', licenseResult: '' }),
    )
    expect(parsed.ok && 'license' in parsed.value).toBe(false)
  })

  it('carries a retry application id and refuses one that is not a uuid', () => {
    const id = '00000000-0000-4000-8000-0000000000aa'
    expect(parseQuickIssue(form({ ...BASE, applicationId: id }))).toMatchObject({
      ok: true,
      value: { applicationId: id },
    })
    const bad = parseQuickIssue(form({ ...BASE, applicationId: 'not-a-uuid' }))
    expect(bad).toMatchObject({
      ok: false,
      error: { fieldErrors: { applicationId: expect.any(String) } },
    })
  })
})
