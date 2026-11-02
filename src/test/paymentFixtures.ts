import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { createAttempt } from '@/features/payments/attempts'
import { saveProcessorAccount } from '@/features/payments/processorAccounts'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import { saveAndPublish } from '@/test/configFixtures'
import type { TradeFixture } from '@/test/ledgerFixtures'

const signal = new AbortController().signal

export const ACCOUNT_REF = 'acct_alder'

export const PAYMENT_SETTINGS = {
  key: 'default',
  convenienceFee: { basisPoints: 300, fixedCents: 0, appliesTo: ['card_online', 'card_present'] },
  receiptFooter: 'Thank you.',
  checksPayableTo: 'Town of Alder Pond',
}

export async function setupPayments(
  db: Db,
  admin: Actor,
  processor: 'stripe' | 'clover' | 'simulated' = 'stripe',
  accountRef: string = ACCOUNT_REF,
): Promise<{ accountId: string }> {
  await saveAndPublish(db, admin, 'payment_settings', 'default', PAYMENT_SETTINGS)
  const saved = await saveProcessorAccount(
    db,
    admin,
    {
      processor,
      mode: 'test',
      accountRef,
      settings: {},
      credentials: { secretKey: 'sk_test_123' },
      webhookSecret: 'whsec_test',
    },
    signal,
    { simulatedEnabled: true },
  )
  if (!saved.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'processor account fixture failed')
  return { accountId: saved.value.accountId }
}

export async function makeCardAttempt(
  db: Db,
  trade: TradeFixture,
  channel: 'card_online' | 'card_present' = 'card_online',
): Promise<{ attemptId: string; amountCents: number }> {
  const created = await db.transaction((tx) =>
    createAttempt(
      tx,
      trade.world.staff,
      { channel, applicationIds: [trade.applicationId], payerName: 'Pat Contractor' },
      signal,
    ),
  )
  if (!created.ok) throw new AppError(ErrorIds.DB_INVARIANT, `attempt fixture: ${created.error}`)
  return created.value
}

export function processorState(
  partial: Partial<ProcessorPaymentState> = {},
): ProcessorPaymentState {
  return {
    objectId: 'pi_1',
    accountRef: ACCOUNT_REF,
    status: 'captured',
    amountCents: 4635,
    settled: false,
    refunds: [],
    disputes: [],
    ...partial,
  }
}
