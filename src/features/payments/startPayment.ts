import { and, eq, inArray, isNull } from 'drizzle-orm'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import {
  type AttemptState,
  applications,
  type PaymentAttemptRow,
  paymentAttempts,
  projectParties,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { createAttempt } from '@/features/payments/attempts'
import { markVoided } from '@/features/payments/attemptTransitions'
import { openProcessor, type ProcessorFactoryDeps } from '@/features/payments/openProcessor'
import type { ProcessorError } from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

export { checkWithProcessor, voidAttempt } from '@/features/payments/attemptActions'
export {
  reconnectSimulatedReader,
  resolveSimulatedReader,
} from '@/features/payments/simulatedReader'

export interface StartDeps extends ProcessorFactoryDeps {
  now?: Date
  baseUrl?: string
}

const COUNTER_ROLES = ['staff', 'admin', 'finance'] as const
const PAYER_PARTY_ROLES = ['applicant', 'owner', 'agent', 'contractor'] as const

async function mayPayFor(db: Db, actor: Actor, applicationIds: string[]): Promise<boolean> {
  const unique = [...new Set(applicationIds)]
  const apps = await db
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(inArray(applications.id, unique))
  if (apps.length !== unique.length || unique.length === 0) return false
  if (actor.roles.some((r) => (COUNTER_ROLES as readonly string[]).includes(r))) return true
  const projectIds = [...new Set(apps.map((a) => a.projectId))]
  const parties = await db
    .select({ projectId: projectParties.projectId })
    .from(projectParties)
    .where(
      and(
        inArray(projectParties.projectId, projectIds),
        eq(projectParties.userId, actor.userId),
        isNull(projectParties.removedAt),
        inArray(projectParties.role, [...PAYER_PARTY_ROLES]),
      ),
    )
  return new Set(parties.map((p) => p.projectId)).size === projectIds.length
}

async function failAttempt(
  db: Db,
  attempt: PaymentAttemptRow,
  anomaly: string,
  now: Date,
): Promise<void> {
  await db.transaction((tx) => markVoided(tx, attempt, now, anomaly))
}

async function loadAttempt(db: Db, attemptId: string): Promise<PaymentAttemptRow> {
  const [row] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId))
  if (row === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Payment attempt vanished after creation', {
      attemptId,
    })
  }
  return row
}

export async function startOnlinePayment(
  db: Db,
  actor: Actor,
  input: { applicationIds: string[]; payerName: string; payerEmail?: string },
  signal: AbortSignal,
  deps: StartDeps = {},
): Promise<
  Result<
    { attemptId: string; redirectUrl: string },
    'not_found' | 'nothing_due' | 'not_configured' | ProcessorError
  >
> {
  signal.throwIfAborted()
  if (!(await mayPayFor(db, actor, input.applicationIds))) return err('not_found')
  const created = await transactionResult(db, (tx) =>
    createAttempt(
      tx,
      actor,
      { channel: 'card_online', ...input, payerUserId: actor.userId },
      signal,
    ),
  )
  if (!created.ok) return err(created.error)
  const attempt = await loadAttempt(db, created.value.attemptId)
  const now = deps.now ?? new Date()
  const opened = await openProcessor(db, attempt.processorAccountId, deps, signal)
  if (!opened.ok) return err(opened.error)
  const returnUrl = `${deps.baseUrl ?? env.BASE_URL}/payments/return/${attempt.id}`
  const checkout = await opened.value.processor.createOnlineCheckout(
    {
      attemptId: attempt.id,
      amountCents: attempt.amountCents,
      description: 'Permit fees',
      returnUrl,
      cancelUrl: returnUrl,
      idempotencyKey: attempt.idempotencyKey,
    },
    signal,
  )
  if (!checkout.ok) {
    await failAttempt(db, attempt, 'checkout_failed', now)
    return err(checkout.error)
  }
  await db
    .update(paymentAttempts)
    .set({
      checkoutRef: checkout.value.checkoutRef,
      processorObjectId: checkout.value.objectId,
      updatedAt: now,
    })
    .where(eq(paymentAttempts.id, attempt.id))
  return ok({ attemptId: attempt.id, redirectUrl: checkout.value.redirectUrl })
}

export async function startCardPresentPayment(
  db: Db,
  actor: Actor,
  input: { applicationIds: string[]; payerName: string },
  signal: AbortSignal,
  deps: StartDeps = {},
): Promise<
  Result<
    { attemptId: string; state: AttemptState; outcomeUnknown: boolean },
    'forbidden' | 'nothing_due' | 'not_configured' | ProcessorError
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'payment.collect', signal)
  if (!allowed.ok) return err('forbidden')
  const created = await transactionResult(db, (tx) =>
    createAttempt(tx, actor, { channel: 'card_present', ...input }, signal),
  )
  if (!created.ok) return err(created.error)
  return await sendToReader(db, created.value.attemptId, signal, deps)
}

export async function sendToReader(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
  deps: StartDeps = {},
): Promise<
  Result<{ attemptId: string; state: AttemptState; outcomeUnknown: boolean }, ProcessorError>
> {
  const attempt = await loadAttempt(db, attemptId)
  const now = deps.now ?? new Date()
  const opened = await openProcessor(db, attempt.processorAccountId, deps, signal)
  if (!opened.ok) return err(opened.error)
  const started = await opened.value.processor.startCardPresent(
    {
      attemptId: attempt.id,
      amountCents: attempt.amountCents,
      idempotencyKey: attempt.idempotencyKey,
    },
    signal,
  )
  if (!started.ok) {
    await failAttempt(db, attempt, 'reader_start_failed', now)
    return err(started.error)
  }
  const unknown = 'outcome' in started.value
  await db
    .update(paymentAttempts)
    .set({
      processorObjectId: 'objectId' in started.value ? started.value.objectId : null,
      outcomeUnknown: unknown,
      updatedAt: now,
    })
    .where(eq(paymentAttempts.id, attempt.id))
  return ok({ attemptId: attempt.id, state: 'pending', outcomeUnknown: unknown })
}
