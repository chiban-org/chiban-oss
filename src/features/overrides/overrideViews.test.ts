import { describe, expect, it } from 'vitest'
import type { FeeOverrideRow } from '@/features/fees/feeOverrides'
import {
  arrangeAliasOverrides,
  readAliasOverrideView,
} from '@/features/overrides/aliasOverrideView'
import { arrangeFeeOverrides, readFeeOverrideView } from '@/features/overrides/feeOverrideView'
import type { AliasOverrideRow, OverrideStatus } from '@/features/parcels/aliasOverrides'
import type { CivilDate } from '@/types/civilDate'

function alias(
  id: string,
  patch: Partial<AliasOverrideRow> & { status: OverrideStatus },
): AliasOverrideRow {
  return {
    id,
    format: 'gis12',
    value: id,
    parcelId: `p-${id}`,
    parcelDisplayId: id,
    reason: 'because',
    createdBy: 'u',
    createdAt: new Date('2027-01-01T00:00:00Z'),
    expiresOn: null,
    replaced: null,
    ...patch,
  }
}

const ALIASES = [
  alias('3', { status: 'applied', reason: 'zoning fix', expiresOn: '2027-06-01' as CivilDate }),
  alias('1', {
    status: 'expired',
    parcelDisplayId: null,
    replaced: { parcelId: 'x', displayId: 'B-2' },
  }),
  alias('2', {
    status: 'applied',
    reason: 'Another',
    replaced: { parcelId: 'y', displayId: 'A-1' },
  }),
]
const aliasIds = (raw: Record<string, string | string[]>) =>
  arrangeAliasOverrides(ALIASES, readAliasOverrideView(raw)).rows.map((r) => r.id)

describe('parcel ID overrides view', () => {
  it('keeps the list order by default', () => {
    expect(aliasIds({})).toEqual(['3', '1', '2'])
  })

  it('sorts by id, reason, and replaced parcel with empties last', () => {
    expect(aliasIds({ sort: 'id' })).toEqual(['1', '2', '3'])
    expect(aliasIds({ sort: 'reason' })).toEqual(['2', '1', '3'])
    expect(aliasIds({ sort: 'replaced' })).toEqual(['2', '1', '3'])
    expect(aliasIds({ sort: 'replaced', dir: 'desc' })).toEqual(['1', '2', '3'])
  })

  it('sorts by parcel with a missing map-lot id last and by expiry with never last', () => {
    expect(aliasIds({ sort: 'parcel' })).toEqual(['2', '3', '1'])
    expect(aliasIds({ sort: 'expires' })).toEqual(['3', '1', '2'])
  })

  it('sorts by the status label with ties in list order', () => {
    expect(aliasIds({ sort: 'status' })).toEqual(['3', '2', '1'])
  })

  it('filters by status and expiry and counts each chip against the other group', () => {
    expect(aliasIds({ status: 'applied' })).toEqual(['3', '2'])
    expect(aliasIds({ status: 'applied', expiry: 'dated' })).toEqual(['3'])
    const { chips } = arrangeAliasOverrides(ALIASES, readAliasOverrideView({ status: 'applied' }))
    expect(chips[0]?.chips.map((c) => [c.label, c.count, c.active])).toEqual([
      ['Applied', 2, true],
      ['No match', 0, false],
      ['Superseded', 0, false],
      ['Expired', 1, false],
    ])
    expect(chips[1]?.chips.map((c) => c.count)).toEqual([1, 1])
  })

  it('ignores unknown filter values', () => {
    expect(aliasIds({ status: 'bogus' })).toEqual(['3', '1', '2'])
  })
})

function fee(
  id: string,
  patch: Partial<FeeOverrideRow> & { status: OverrideStatus },
): FeeOverrideRow {
  return {
    id,
    applicationId: `app-${id}`,
    applicationNumber: `BP-${id}`,
    feeCode: 'plan_review',
    kind: 'waive',
    amountCents: null,
    reason: 'r',
    supersededBy: null,
    createdAt: new Date('2027-01-01T00:00:00Z'),
    ...patch,
  } as FeeOverrideRow
}

const FEES = [
  fee('2', { status: 'applied', kind: 'set_amount', amountCents: 5000, feeCode: 'b_fee' }),
  fee('1', { status: 'superseded', feeCode: 'a_fee' }),
  fee('3', { status: 'applied', kind: 'set_amount', amountCents: 100, reason: 'zz' }),
]
const feeIds = (raw: Record<string, string | string[]>) =>
  arrangeFeeOverrides(FEES, readFeeOverrideView(raw)).rows.map((r) => r.id)

describe('fee overrides view', () => {
  it('keeps the list order by default and sorts by application, fee and amount', () => {
    expect(feeIds({})).toEqual(['2', '1', '3'])
    expect(feeIds({ sort: 'application' })).toEqual(['1', '2', '3'])
    expect(feeIds({ sort: 'fee' })).toEqual(['1', '2', '3'])
    expect(feeIds({ sort: 'override' })).toEqual(['1', '3', '2'])
    expect(feeIds({ sort: 'override', dir: 'desc' })).toEqual(['2', '3', '1'])
  })

  it('filters by status and by kind of override', () => {
    expect(feeIds({ status: 'superseded' })).toEqual(['1'])
    expect(feeIds({ kind: 'set_amount' })).toEqual(['2', '3'])
    expect(feeIds({ kind: 'set_amount', status: 'superseded' })).toEqual([])
  })
})
