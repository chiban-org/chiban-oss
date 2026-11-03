import type { CensusLargePermit } from '@/features/census/bpsReport'
import type { SortConfig, SortState } from '@/features/dataTable/sort'
import type { CashReceiptsReport, ReportMethod } from '@/features/reports/cashReceipts'
import type { PermitVolumeRow } from '@/features/reports/permitVolume'
import type { ProcessingTimeRow } from '@/features/reports/processingTime'
import type { RevenueRow } from '@/features/reports/revenue'
import { sortRows } from '@/features/staffTables/sortRows'

export const REPORTS_PATH = '/staff/reports'
export const CASH_RECEIPTS_PATH = '/staff/reports/cash-receipts'
export const CENSUS_PATH = '/staff/reports/census'

export const VOLUME_SCOPE = 'volume'
export const PROCESSING_SCOPE = 'processing'
export const REVENUE_SCOPE = 'revenue'
export const FEES_SCOPE = 'fees'
export const CHECKS_SCOPE = 'checks'
export const LARGE_SCOPE = 'large'

export type VolumeSortKey =
  | 'order'
  | 'month'
  | 'type'
  | 'received'
  | 'issued'
  | 'closed'
  | 'denied'
  | 'withdrawn'

export const VOLUME_SORT: SortConfig<VolumeSortKey> = {
  defaultKey: 'order',
  columns: {
    order: 'asc',
    month: 'asc',
    type: 'asc',
    received: 'desc',
    issued: 'desc',
    closed: 'desc',
    denied: 'desc',
    withdrawn: 'desc',
  },
}

export function sortVolume(
  rows: readonly PermitVolumeRow[],
  state: SortState<VolumeSortKey>,
  typeLabel: (type: string) => string,
) {
  return sortRows(rows, state, {
    order: null,
    month: (r) => r.month,
    type: (r) => typeLabel(r.type),
    received: (r) => r.received,
    issued: (r) => r.issued,
    closed: (r) => r.closed,
    denied: (r) => r.denied,
    withdrawn: (r) => r.withdrawn,
  })
}

export type ProcessingSortKey =
  | 'order'
  | 'type'
  | 'issued'
  | 'median'
  | 'p90'
  | 'decision'
  | 'onTime'
  | 'late'

export const PROCESSING_SORT: SortConfig<ProcessingSortKey> = {
  defaultKey: 'order',
  columns: {
    order: 'asc',
    type: 'asc',
    issued: 'desc',
    median: 'desc',
    p90: 'desc',
    decision: 'desc',
    onTime: 'desc',
    late: 'desc',
  },
}

export function sortProcessing(
  rows: readonly ProcessingTimeRow[],
  state: SortState<ProcessingSortKey>,
  typeLabel: (type: string) => string,
) {
  return sortRows(rows, state, {
    order: null,
    type: (r) => typeLabel(r.type),
    issued: (r) => r.issued,
    median: (r) => r.medianReceivedToIssued,
    p90: (r) => r.p90ReceivedToIssued,
    decision: (r) => r.medianCompleteToDecision,
    onTime: (r) => r.decidedOnTime,
    late: (r) => r.decidedLate,
  })
}

export type RevenueSortKey = 'order' | 'month' | 'fee' | 'net'

export const REVENUE_SORT: SortConfig<RevenueSortKey> = {
  defaultKey: 'order',
  columns: { order: 'asc', month: 'asc', fee: 'asc', net: 'desc' },
}

export function sortRevenue(rows: readonly RevenueRow[], state: SortState<RevenueSortKey>) {
  return sortRows(rows, state, {
    order: null,
    month: (r) => r.month,
    fee: (r) => r.label,
    net: (r) => r.netCents,
  })
}

export type FeeSortKey = 'order' | 'fee' | ReportMethod | 'total'

export const FEE_SORT: SortConfig<FeeSortKey> = {
  defaultKey: 'order',
  columns: {
    order: 'asc',
    fee: 'asc',
    cash: 'desc',
    check: 'desc',
    card_present: 'desc',
    card_online: 'desc',
    simulated: 'desc',
    total: 'desc',
  },
}

export function sortFeeRows(
  rows: CashReceiptsReport['rows'],
  state: SortState<FeeSortKey>,
): CashReceiptsReport['rows'] {
  return sortRows(rows, state, {
    order: null,
    fee: (r) => r.label,
    cash: (r) => r.byMethod.cash,
    check: (r) => r.byMethod.check,
    card_present: (r) => r.byMethod.card_present,
    card_online: (r) => r.byMethod.card_online,
    simulated: (r) => r.byMethod.simulated,
    total: (r) => r.totalCents,
  })
}

export type CheckSortKey = 'order' | 'number' | 'payer' | 'amount'

export const CHECK_SORT: SortConfig<CheckSortKey> = {
  defaultKey: 'order',
  columns: { order: 'asc', number: 'asc', payer: 'asc', amount: 'desc' },
}

export function sortChecks(
  rows: CashReceiptsReport['checks'],
  state: SortState<CheckSortKey>,
): CashReceiptsReport['checks'] {
  return sortRows(rows, state, {
    order: null,
    number: (r) => r.number,
    payer: (r) => r.payerName,
    amount: (r) => r.amountCents,
  })
}

export type LargePermitSortKey =
  | 'order'
  | 'permit'
  | 'description'
  | 'address'
  | 'owner'
  | 'buildings'
  | 'units'
  | 'valuation'

export const LARGE_PERMIT_SORT: SortConfig<LargePermitSortKey> = {
  defaultKey: 'order',
  columns: {
    order: 'asc',
    permit: 'asc',
    description: 'asc',
    address: 'asc',
    owner: 'asc',
    buildings: 'desc',
    units: 'desc',
    valuation: 'desc',
  },
}

export function sortLargePermits(
  rows: readonly CensusLargePermit[],
  state: SortState<LargePermitSortKey>,
) {
  return sortRows(rows, state, {
    order: null,
    permit: (r) => r.number,
    description: (r) => r.description,
    address: (r) => r.siteAddress,
    owner: (r) => r.ownerOrBuilder,
    buildings: (r) => r.buildings,
    units: (r) => r.housingUnits,
    valuation: (r) => r.valuationDollars,
  })
}
