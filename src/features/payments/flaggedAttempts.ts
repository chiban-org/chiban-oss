import { count, desc, eq, isNotNull, type SQL } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { paymentAttempts } from '@/db/schema'
import { readOffset, type TableParams, tableHref } from '@/features/dataTable/params'
import { PAYMENTS_PATH } from '@/features/payments/entryListParams'

export const FLAGGED_KINDS = ['unknown', 'anomalies'] as const
export type FlaggedKind = (typeof FLAGGED_KINDS)[number]
export type FlaggedOffsets = Record<FlaggedKind, number>

export const FLAGGED_PAGE_SIZE = 50

export const FLAGGED_OFFSET_PARAMS: Readonly<Record<FlaggedKind, string>> = {
  unknown: 'unknownAt',
  anomalies: 'anomalyAt',
}

export interface FlaggedPage {
  rows: (typeof paymentAttempts.$inferSelect)[]
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
}

const FLAGGED: Readonly<Record<FlaggedKind, { where: SQL; order: SQL }>> = {
  unknown: {
    where: eq(paymentAttempts.outcomeUnknown, true),
    order: desc(paymentAttempts.createdAt),
  },
  anomalies: { where: isNotNull(paymentAttempts.anomaly), order: desc(paymentAttempts.updatedAt) },
}

export async function countFlagged(db: DbOrTx, kind: FlaggedKind, signal: AbortSignal) {
  signal.throwIfAborted()
  const [row] = await db.select({ n: count() }).from(paymentAttempts).where(FLAGGED[kind].where)
  return row?.n ?? 0
}

export async function listFlagged(
  db: DbOrTx,
  kind: FlaggedKind,
  offset: number,
  signal: AbortSignal,
): Promise<FlaggedPage> {
  const [total, rows] = await Promise.all([
    countFlagged(db, kind, signal),
    db
      .select()
      .from(paymentAttempts)
      .where(FLAGGED[kind].where)
      .orderBy(FLAGGED[kind].order, desc(paymentAttempts.id))
      .limit(FLAGGED_PAGE_SIZE)
      .offset(offset),
  ])
  return {
    rows,
    total,
    offset,
    prevOffset: offset === 0 ? null : Math.max(0, offset - FLAGGED_PAGE_SIZE),
    nextOffset: offset + FLAGGED_PAGE_SIZE < total ? offset + FLAGGED_PAGE_SIZE : null,
  }
}

export function readFlaggedOffsets(params: TableParams): FlaggedOffsets {
  return {
    unknown: readOffset(params, FLAGGED_OFFSET_PARAMS.unknown),
    anomalies: readOffset(params, FLAGGED_OFFSET_PARAMS.anomalies),
  }
}

export function flaggedPageHref(
  params: TableParams,
  kind: FlaggedKind,
  anchor: string,
  offset: number | null,
): string | null {
  if (offset === null) return null
  const name = FLAGGED_OFFSET_PARAMS[kind]
  return `${tableHref(PAYMENTS_PATH, params, { [name]: offset === 0 ? null : String(offset) })}#${anchor}`
}
