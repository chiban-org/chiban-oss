import { describe, expect, it } from 'vitest'
import {
  sortChecks,
  sortFeeRows,
  sortLargePermits,
  sortProcessing,
  sortRevenue,
  sortVolume,
} from '@/features/reports/reportSorts'

const label = (t: string) => ({ bp: 'Building', el: 'Electrical' })[t] ?? t

describe('report table sorting', () => {
  const volume = (month: string, type: string, received: number) => ({
    month,
    type,
    received,
    issued: 0,
    closed: 0,
    denied: 0,
    withdrawn: 0,
    fields: {},
  })
  const VOLUME = [
    volume('2027-02', 'el', 3),
    volume('2027-01', 'bp', 3),
    volume('2027-01', 'el', 9),
  ]
  const order = (state: Parameters<typeof sortVolume>[1]) =>
    sortVolume(VOLUME, state, label).map((r) => `${r.month}/${r.type}`)

  it('lists the oldest month first, then the type label, by default and sorts months chronologically', () => {
    expect(order({ key: 'order', dir: 'asc' })).toEqual(['2027-01/bp', '2027-01/el', '2027-02/el'])
    expect(order({ key: 'month', dir: 'asc' })).toEqual(['2027-01/bp', '2027-01/el', '2027-02/el'])
  })

  it('sorts by the type label shown and by counts with ties in report order', () => {
    expect(order({ key: 'type', dir: 'asc' })).toEqual(['2027-01/bp', '2027-02/el', '2027-01/el'])
    expect(order({ key: 'received', dir: 'desc' })).toEqual([
      '2027-01/el',
      '2027-02/el',
      '2027-01/bp',
    ])
  })

  it('puts empty processing times last in both directions', () => {
    const row = (type: string, med: number | null) => ({
      type,
      issued: 1,
      medianReceivedToIssued: med,
      p90ReceivedToIssued: null,
      medianCompleteToDecision: null,
      decidedOnTime: null,
      decidedLate: null,
      decided: 0,
      decidedNotIssued: 0,
      medianReceivedToDecision: null,
      p90ReceivedToDecision: null,
      fields: {},
    })
    const rows = [row('bp', null), row('el', 4), row('x', 9)]
    expect(sortProcessing(rows, { key: 'median', dir: 'asc' }, label).map((r) => r.type)).toEqual([
      'el',
      'x',
      'bp',
    ])
    expect(sortProcessing(rows, { key: 'median', dir: 'desc' }, label).map((r) => r.type)).toEqual([
      'x',
      'el',
      'bp',
    ])
  })

  it('lists processing times by the type label shown by default', () => {
    const row = (type: string) => ({
      type,
      issued: 1,
      medianReceivedToIssued: null,
      p90ReceivedToIssued: null,
      medianCompleteToDecision: null,
      decidedOnTime: null,
      decidedLate: null,
      decided: 0,
      decidedNotIssued: 0,
      medianReceivedToDecision: null,
      p90ReceivedToDecision: null,
      fields: {},
    })
    const rows = [row('el'), row('bp')]
    expect(sortProcessing(rows, { key: 'order', dir: 'asc' }, label).map((r) => r.type)).toEqual([
      'bp',
      'el',
    ])
  })

  it('sorts revenue by net amount', () => {
    const rows = [
      { month: '2027-01', kind: 'fee', code: 'a', label: 'A', netCents: 100 },
      { month: '2027-01', kind: 'fee', code: 'b', label: 'B', netCents: 900 },
    ] as const
    expect(sortRevenue(rows, { key: 'net', dir: 'desc' }).map((r) => r.code)).toEqual(['b', 'a'])
  })

  it('sorts cash receipt fee rows by one method', () => {
    const by = (cash: number) => ({ cash, check: 0, card_present: 0, card_online: 0, simulated: 0 })
    const rows = [
      { feeCode: 'a', label: 'A', byMethod: by(5), totalCents: 5 },
      { feeCode: 'b', label: 'B', byMethod: by(50), totalCents: 50 },
    ]
    expect(sortFeeRows(rows, { key: 'cash', dir: 'desc' }).map((r) => r.feeCode)).toEqual([
      'b',
      'a',
    ])
  })

  it('sorts checks by number, payer and amount', () => {
    const checks = [
      { number: '10', payerName: 'Zed', amountCents: 5, returnedOn: null },
      { number: '9', payerName: 'Amy', amountCents: 50, returnedOn: null },
    ]
    expect(sortChecks(checks, { key: 'number', dir: 'asc' }).map((c) => c.number)).toEqual([
      '9',
      '10',
    ])
    expect(sortChecks(checks, { key: 'payer', dir: 'asc' }).map((c) => c.payerName)).toEqual([
      'Amy',
      'Zed',
    ])
    expect(sortChecks(checks, { key: 'amount', dir: 'desc' }).map((c) => c.number)).toEqual([
      '9',
      '10',
    ])
  })

  it('sorts large permits by valuation', () => {
    const permit = (number: string, valuationDollars: number) => ({
      number,
      description: '',
      siteAddress: '',
      ownerOrBuilder: '',
      buildings: 1,
      housingUnits: 1,
      valuationDollars,
    })
    const rows = [permit('a', 2_000_000), permit('b', 5_000_000)]
    expect(sortLargePermits(rows, { key: 'valuation', dir: 'desc' }).map((p) => p.number)).toEqual([
      'b',
      'a',
    ])
  })
})
