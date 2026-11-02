import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { paymentAttempts, simulatedProcessorObjects } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { handleWebhook } from '@/features/payments/handleWebhook'
import { attemptVisibleTo } from '@/features/payments/paymentReturn'
import { getProcessorAccount } from '@/features/payments/processorAccounts'
import {
  SIMULATED_ACCOUNT_REF,
  SIMULATED_SIGNATURE_HEADER,
  signSimulatedPayload,
} from '@/features/payments/processors/simulated'
import { err, ok, type Result } from '@/types/result'

export interface DevCheckoutView {
  objectId: string
  amountCents: number
  status: string
  attemptId: string
}

export interface DevCheckoutDeps {
  now?: Date
  enabled?: boolean
}

async function viewOf(
  db: Db,
  objectId: string,
  visibleTo?: Actor | null,
): Promise<(DevCheckoutView & { accountId: string }) | null> {
  const [row] = await db
    .select({
      amountCents: simulatedProcessorObjects.amountCents,
      status: simulatedProcessorObjects.status,
      attemptId: paymentAttempts.id,
      accountId: paymentAttempts.processorAccountId,
    })
    .from(simulatedProcessorObjects)
    .innerJoin(paymentAttempts, eq(paymentAttempts.processorObjectId, simulatedProcessorObjects.id))
    .where(
      and(
        eq(simulatedProcessorObjects.id, objectId),
        visibleTo === undefined ? undefined : attemptVisibleTo(visibleTo),
      ),
    )
  return row === undefined ? null : { objectId, ...row }
}

export async function loadDevCheckout(
  db: Db,
  objectId: string,
  options: { enabled: boolean; actor: Actor | null },
  signal: AbortSignal,
): Promise<DevCheckoutView | null> {
  signal.throwIfAborted()
  if (!options.enabled) return null
  const view = await viewOf(db, objectId, options.actor)
  return view === null
    ? null
    : { objectId, amountCents: view.amountCents, status: view.status, attemptId: view.attemptId }
}

export async function resolveDevCheckout(
  db: Db,
  objectId: string,
  decision: 'approve' | 'decline',
  signal: AbortSignal,
  deps: DevCheckoutDeps = {},
): Promise<Result<{ attemptId: string }, 'not_found'>> {
  signal.throwIfAborted()
  if (!(deps.enabled ?? env.ENABLE_SIMULATED_PAYMENTS)) return err('not_found')
  const view = await viewOf(db, objectId)
  if (view === null) return err('not_found')
  const opened = await getProcessorAccount(db, view.accountId, signal)
  if (opened.state !== 'known' || opened.value.account.processor !== 'simulated')
    return err('not_found')
  const now = deps.now ?? new Date()
  await db
    .update(simulatedProcessorObjects)
    .set({ status: decision === 'approve' ? 'captured' : 'declined' })
    .where(eq(simulatedProcessorObjects.id, objectId))
  const rawBody = JSON.stringify({
    eventId: `sim_evt_${randomUUID()}`,
    type: `simulated.checkout.${decision}`,
    objectId,
    checkoutRef: objectId,
    accountRef: SIMULATED_ACCOUNT_REF,
    livemode: false,
  })
  await handleWebhook(
    db,
    { now },
    {
      accountId: view.accountId,
      rawBody,
      headers: new Headers({
        [SIMULATED_SIGNATURE_HEADER]: signSimulatedPayload(
          opened.value.webhookSecret,
          rawBody,
          now,
        ),
      }),
    },
    signal,
  )
  return ok({ attemptId: view.attemptId })
}
