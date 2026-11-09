import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { feeBalance } from '@/features/ledger/feeBalance'
import { loadCardReader } from '@/features/payments/cardReader'
import type { ProcessorError } from '@/features/payments/processors/types'
import { startCardPresentPayment } from '@/features/payments/startPayment'
import { err, ok, type Result } from '@/types/result'

export interface ApplicationCardStarted {
  attemptId: string
  outcomeUnknown: boolean
}

export type ApplicationCardError =
  | 'forbidden'
  | 'not_found'
  | 'no_reader'
  | 'card_attempt_open'
  | 'nothing_due'
  | 'not_configured'
  | ProcessorError

export async function startApplicationCardPayment(
  db: Db,
  actor: Actor,
  input: { applicationId: string; payerName: string },
  signal: AbortSignal,
): Promise<Result<ApplicationCardStarted, ApplicationCardError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'payment.collect', signal))) return err('forbidden')
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  if (app === undefined) return err('not_found')
  if (!(await loadCardReader(db, signal)).available) return err('no_reader')
  const balance = await feeBalance(db, input.applicationId, signal)
  if (balance.pendingAttempts > 0 || balance.unknownAttempts > 0) return err('card_attempt_open')
  if (balance.dueCents === 0) return err('nothing_due')
  const started = await startCardPresentPayment(
    db,
    actor,
    { applicationIds: [input.applicationId], payerName: input.payerName },
    signal,
  )
  if (!started.ok) return err(started.error)
  return ok({ attemptId: started.value.attemptId, outcomeUnknown: started.value.outcomeUnknown })
}
