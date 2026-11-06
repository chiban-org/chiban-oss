import { describe, expect, it } from 'vitest'
import { choice, date, int, invalidVariants, money, phone, text, uuid } from './fields'

const input = {
  title: 'Code officer',
  days: '30',
  on: '2027-03-01',
  id: 'x',
  kind: 'a',
  tel: '603-555-0142',
  fee: '25.00',
}

function applied(fields: Parameters<typeof invalidVariants>[0]) {
  return invalidVariants(fields).map((v) => ({ title: v.title, input: v.apply(input) }))
}

describe('invalidVariants', () => {
  it('leaves a required text field out, blanks it, and overflows its max', () => {
    expect(applied({ title: text({ required: true, max: 5 }) })).toEqual([
      { title: 'title left out', input: { ...input, title: undefined } },
      { title: 'title as whitespace only', input: { ...input, title: '   ' } },
      { title: 'title longer than 5 characters', input: { ...input, title: 'xxxxxx' } },
    ])
  })

  it('generates nothing for an optional text field without a max', () => {
    expect(applied({ title: text() })).toEqual([])
  })

  it('steps an integer one past each bound and feeds it a fraction and words', () => {
    expect(
      applied({ days: int({ min: 1, max: 3650 }) }).map((v) => [v.title, v.input.days]),
    ).toEqual([
      ['days below 1', '0'],
      ['days above 3650', '3651'],
      ['days as a fraction', '1.5'],
      ['days as words', 'thirty'],
    ])
  })

  it('feeds a date an impossible day and a non-date', () => {
    expect(applied({ on: date({ required: true }) }).map((v) => [v.title, v.input.on])).toEqual([
      ['on left out', undefined],
      ['on as an impossible date', '2027-02-30'],
      ['on as words', 'next Tuesday'],
    ])
  })

  it('feeds a uuid and a choice values they cannot take', () => {
    expect(applied({ id: uuid(), kind: choice() }).map((v) => [v.title, v.input])).toEqual([
      ['id as words', { ...input, id: 'not-a-uuid' }],
      ['kind outside its choices', { ...input, kind: 'not-a-choice' }],
    ])
  })

  it('reports the field and the variant kind so expectations can depend on them', () => {
    const [first] = invalidVariants({ days: int({ min: 1 }) })
    expect(first).toMatchObject({ field: 'days', kind: 'below_min' })
  })

  it('steps a bounded date one day past each bound', () => {
    expect(
      applied({ on: date({ earliest: '2026-11-06', latest: '2099-12-31' }) }).map((v) => [
        v.title,
        v.input.on,
      ]),
    ).toEqual([
      ['on as an impossible date', '2027-02-30'],
      ['on as words', 'next Tuesday'],
      ['on before 2026-11-06', '2026-11-05'],
      ['on after 2099-12-31', '2100-01-01'],
    ])
  })

  it('feeds a phone letters and too few digits', () => {
    expect(applied({ tel: phone() }).map((v) => [v.title, v.input.tel])).toEqual([
      ['tel as letters', 'abc'],
      ['tel with too few digits', '555-014'],
    ])
  })

  it('feeds money below its minimum, sub-cent, negative and as words', () => {
    expect(applied({ fee: money({ min: 1 }) }).map((v) => [v.title, v.input.fee])).toEqual([
      ['fee below 0.01', '0.00'],
      ['fee with a fraction of a cent', '1.005'],
      ['fee as a negative amount', '-5'],
      ['fee as words', 'abc'],
    ])
  })
})
