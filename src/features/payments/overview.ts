import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  applications,
  enforcementCases,
  enforcementFines,
  ledgerAllocations,
  ledgerEntries,
  paymentAttempts,
  receipts,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  type EntryFacets,
  type EntryView,
  entryFacetsOn,
  listEntriesOn,
  type RangeCounts,
  rangeCountsOn,
} from '@/features/payments/entryList'
import { ENTRY_PAGE_SIZE } from '@/features/payments/entryListParams'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const ATTEMPT_LIMIT = 50

export interface PaymentsOverview {
  unknownAttempts: (typeof paymentAttempts.$inferSelect)[]
  anomalies: (typeof paymentAttempts.$inferSelect)[]
  overpayments: { applicationId: string; applicationNumber: string; amountCents: number }[]
  entryFacets: EntryFacets
  rangeCounts: RangeCounts
  entryPage: { total: number; offset: number; prevOffset: number | null; nextOffset: number | null }
  entries: {
    id: string
    entryType: string
    method: string
    amountCents: number
    payerName: string
    receiptId: string | null
    receiptNumber: string | null
    records: { number: string; href: string }[]
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

async function entryRecords(
  db: Db,
  entryIds: string[],
): Promise<Map<string, { number: string; href: string }[]>> {
  if (entryIds.length === 0) return new Map()
  const rows = await db
    .selectDistinct({
      entryId: ledgerAllocations.entryId,
      number: applications.number,
      href: sql<string>`'/staff/applications/' || ${applications.id}`,
    })
    .from(ledgerAllocations)
    .innerJoin(applications, eq(applications.id, ledgerAllocations.applicationId))
    .where(sql`${ledgerAllocations.entryId} in ${entryIds}`)
  const fineRows = await db
    .selectDistinct({
      entryId: ledgerAllocations.entryId,
      number: enforcementCases.number,
      href: sql<string>`'/staff/enforcement/' || ${enforcementCases.id}`,
    })
    .from(ledgerAllocations)
    .innerJoin(enforcementFines, eq(enforcementFines.id, ledgerAllocations.fineId))
    .innerJoin(enforcementCases, eq(enforcementCases.id, enforcementFines.caseId))
    .where(sql`${ledgerAllocations.entryId} in ${entryIds}`)
  const byEntry = new Map<string, { number: string; href: string }[]>()
  for (const { entryId, ...record } of [...rows, ...fineRows])
    byEntry.set(entryId, [...(byEntry.get(entryId) ?? []), record])
  return byEntry
}

export async function loadPaymentsOverview(
  db: Db,
  actor: Actor,
  input: { date: CivilDate; entries?: EntryView },
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
  const view = input.entries ?? { filters: {} }
  const entries = await listEntriesOn(db, input.date, view)
  const rangeCounts = await rangeCountsOn(db, input.date, view.filters)
  const total = rangeCounts[view.range ?? 'today']
  const offset = Math.max(view.offset ?? 0, 0)
  const limit = view.limit ?? ENTRY_PAGE_SIZE
  const records = await entryRecords(
    db,
    entries.map((e) => e.id),
  )
  return ok({
    unknownAttempts,
    anomalies,
    overpayments: overpaid.flatMap((o) =>
      o.applicationId === null ? [] : [{ ...o, applicationId: o.applicationId }],
    ),
    entryFacets: await entryFacetsOn(db, input.date, view.filters, view.range),
    rangeCounts,
    entryPage: {
      total,
      offset,
      prevOffset: offset === 0 ? null : Math.max(0, offset - limit),
      nextOffset: offset + limit < total ? offset + limit : null,
    },
    entries: entries.map((e) => ({ ...e, records: records.get(e.id) ?? [] })),
  })
}
