import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  applications,
  ledgerAllocations,
  ledgerEntries,
  paymentAttempts,
  receipts,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const ATTEMPT_LIMIT = 50
const ENTRY_LIMIT = 100

export interface PaymentsOverview {
  unknownAttempts: (typeof paymentAttempts.$inferSelect)[]
  anomalies: (typeof paymentAttempts.$inferSelect)[]
  overpayments: { applicationId: string; applicationNumber: string; amountCents: number }[]
  todaysEntries: {
    id: string
    entryType: string
    method: string
    amountCents: number
    payerName: string
    receiptId: string | null
    receiptNumber: string | null
    applicationNumbers: string[]
  }[]
}

export async function mayViewPayments(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  for (const capability of [
    'payment.collect',
    'payment.report',
    'payment.refund_void_correct',
  ] as const) {
    if (await hasCapability(db, actor.userId, capability, signal)) return true
  }
  return false
}

async function entryApplications(db: Db, entryIds: string[]): Promise<Map<string, string[]>> {
  if (entryIds.length === 0) return new Map()
  const rows = await db
    .selectDistinct({ entryId: ledgerAllocations.entryId, number: applications.number })
    .from(ledgerAllocations)
    .innerJoin(applications, eq(applications.id, ledgerAllocations.applicationId))
    .where(sql`${ledgerAllocations.entryId} in ${entryIds}`)
  const byEntry = new Map<string, string[]>()
  for (const row of rows)
    byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row.number])
  return byEntry
}

export async function loadPaymentsOverview(
  db: Db,
  actor: Actor,
  input: { date: CivilDate },
  signal: AbortSignal,
): Promise<Result<PaymentsOverview, 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayViewPayments(db, actor, signal))) return err('forbidden')
  const unknownAttempts = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.outcomeUnknown, true))
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(ATTEMPT_LIMIT)
  const anomalies = await db
    .select()
    .from(paymentAttempts)
    .where(isNotNull(paymentAttempts.anomaly))
    .orderBy(desc(paymentAttempts.updatedAt))
    .limit(ATTEMPT_LIMIT)
  const overpaid = await db
    .select({
      applicationId: ledgerAllocations.applicationId,
      applicationNumber: applications.number,
      amountCents: sql<number>`sum(${ledgerAllocations.amountCents})::int`,
    })
    .from(ledgerAllocations)
    .innerJoin(applications, eq(applications.id, ledgerAllocations.applicationId))
    .where(eq(ledgerAllocations.targetKind, 'overpayment'))
    .groupBy(ledgerAllocations.applicationId, applications.number)
    .having(sql`sum(${ledgerAllocations.amountCents}) > 0`)
  const entries = await db
    .select({
      id: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      method: ledgerEntries.method,
      amountCents: ledgerEntries.amountCents,
      payerName: ledgerEntries.payerName,
      receiptId: ledgerEntries.receiptId,
      receiptNumber: receipts.number,
    })
    .from(ledgerEntries)
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(and(eq(ledgerEntries.businessDate, input.date)))
    .orderBy(desc(ledgerEntries.postedAt))
    .limit(ENTRY_LIMIT)
  const numbers = await entryApplications(
    db,
    entries.map((e) => e.id),
  )
  return ok({
    unknownAttempts,
    anomalies,
    overpayments: overpaid.flatMap((o) =>
      o.applicationId === null ? [] : [{ ...o, applicationId: o.applicationId }],
    ),
    todaysEntries: entries.map((e) => ({ ...e, applicationNumbers: numbers.get(e.id) ?? [] })),
  })
}
