import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { ledgerEntries } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import type { PermitWorld } from '@/test/applicationFixtures'
import { lineAllocation, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { makeCardAttempt, processorState } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const POSTED_AT = new Date('2027-07-10T17:00:00Z')

export const FIXTURE_PAYMENT_CENTS = 4500

export async function paidOnFreshPermit(
  db: Db,
  world: PermitWorld,
  method: 'cash' | 'check',
): Promise<{ entryId: string; trade: TradeFixture }> {
  const trade = await submittedTrade(db, world, POSTED_AT)
  const paid = await recordCounterPayment(
    db,
    world.staff,
    {
      method,
      amountCents: FIXTURE_PAYMENT_CENTS,
      payerName: 'Pat Contractor',
      ...(method === 'check' ? { checkNumber: '1042' } : {}),
      allocations: [lineAllocation(trade, FIXTURE_PAYMENT_CENTS)],
    },
    signal,
    POSTED_AT,
  )
  if (!paid.ok) throw new AppError(ErrorIds.DB_INVARIANT, paid.error)
  return { entryId: paid.value.entryId, trade }
}

export async function cardPaymentOnFreshPermit(
  db: Db,
  world: PermitWorld,
): Promise<{ entryId: string; trade: TradeFixture }> {
  const trade = await submittedTrade(db, world, POSTED_AT)
  const { attemptId, amountCents } = await makeCardAttempt(db, trade)
  await db.transaction((tx) =>
    reconcileAttempt(
      tx,
      attemptId,
      processorState({ objectId: `pi_${randomUUID()}`, amountCents }),
      { kind: 'event' },
      signal,
      POSTED_AT,
    ),
  )
  const [entry] = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.paymentAttemptId, attemptId))
  if (entry === undefined)
    throw new AppError(ErrorIds.DB_INVARIANT, 'card payment fixture did not post')
  return { entryId: entry.id, trade }
}
