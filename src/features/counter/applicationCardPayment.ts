import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { feeBalance } from '@/features/ledger/feeBalance'
import { createAttempt } from '@/features/payments/attempts'
import { loadCardReader } from '@/features/payments/cardReader'
import type { ProcessorError } from '@/features/payments/processors/types'
import { sendToReader } from '@/features/payments/startPayment'
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
  if (!(await loadCardReader(db, signal)).available) return err('no_reader')
  const created = await transactionResult<{ attemptId: string }, ApplicationCardError>(
    db,
    async (tx) => {
      const [app] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .for('update')
      if (app === undefined) return err('not_found')
      const balance = await feeBalance(tx, input.applicationId, signal)
      if (balance.pendingAttempts > 0 || balance.unknownAttempts > 0) {
        return err('card_attempt_open')
      }
      const attempt = await createAttempt(
        tx,
        actor,
        {
          channel: 'card_present',
          applicationIds: [input.applicationId],
          payerName: input.payerName,
        },
        signal,
      )
      return attempt.ok ? ok({ attemptId: attempt.value.attemptId }) : err(attempt.error)
    },
  )
  if (!created.ok) return err(created.error)
  const sent = await sendToReader(db, created.value.attemptId, signal)
  if (!sent.ok) return err(sent.error)
  return ok({ attemptId: sent.value.attemptId, outcomeUnknown: sent.value.outcomeUnknown })
}
