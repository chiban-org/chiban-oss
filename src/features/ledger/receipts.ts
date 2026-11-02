import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { receiptNumberCounters, receipts } from '@/db/schema'
import { getTownSettings } from '@/features/town/settings'
import { civilYear, todayInTimeZone } from '@/types/civilDate'

const FALLBACK_TIME_ZONE = 'UTC'
const SEQUENCE_WIDTH = 6

export interface IssueReceiptInput {
  kind: 'payment' | 'refund'
  payerName: string
  payerEmail?: string
  totalCents: number
  tenderedCents?: number
  simulated?: boolean
  issuedAt?: Date
}

export async function issueReceipt(
  tx: Tx,
  input: IssueReceiptInput,
  signal: AbortSignal,
): Promise<{ receiptId: string; number: string }> {
  signal.throwIfAborted()
  const issuedAt = input.issuedAt ?? new Date()
  const town = await getTownSettings(tx, signal)
  const businessDate = todayInTimeZone(town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE, issuedAt)
  const year = civilYear(businessDate)
  const [counter] = await tx
    .insert(receiptNumberCounters)
    .values({ year, last: 1 })
    .onConflictDoUpdate({
      target: receiptNumberCounters.year,
      set: { last: sql`${receiptNumberCounters.last} + 1` },
    })
    .returning({ last: receiptNumberCounters.last })
  const number = `R-${year}-${String(counter?.last ?? 1).padStart(SEQUENCE_WIDTH, '0')}`
  const [row] = await tx
    .insert(receipts)
    .values({
      number,
      kind: input.kind,
      issuedAt,
      businessDate,
      payerName: input.payerName,
      payerEmail: input.payerEmail ?? null,
      totalCents: input.totalCents,
      tenderedCents: input.tenderedCents ?? null,
      changeCents:
        input.tenderedCents === undefined ? null : input.tenderedCents - input.totalCents,
      simulated: input.simulated ?? false,
    })
    .returning({ id: receipts.id })
  return { receiptId: row?.id ?? '', number }
}
