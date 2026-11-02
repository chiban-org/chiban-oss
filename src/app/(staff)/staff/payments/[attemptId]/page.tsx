import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import { paymentAttempts, paymentAttemptTransitions, processorAccounts } from '@/db/schema'
import { mayViewPayments } from '@/features/payments/overview'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { checkWithProcessorAction, voidAttemptAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PaymentAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  if (!isUuid(attemptId)) notFound()
  const ctx = await requireStaffContext()
  if (!(await mayViewPayments(ctx.db, ctx.actor, ctx.signal))) notFound()
  const [attempt] = await ctx.db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  if (attempt === undefined) notFound()
  const [account] = await ctx.db
    .select()
    .from(processorAccounts)
    .where(eq(processorAccounts.id, attempt.processorAccountId))
  const transitions = await ctx.db
    .select()
    .from(paymentAttemptTransitions)
    .where(eq(paymentAttemptTransitions.attemptId, attempt.id))
    .orderBy(paymentAttemptTransitions.at)
  const open = attempt.state === 'pending' || attempt.state === 'authorized'
  return (
    <main>
      <h1>Card payment attempt</h1>
      <p>
        {`${formatCents(attempt.amountCents)} from ${attempt.payerName} by ${attempt.channel.replaceAll('_', ' ')}. State: ${attempt.state}.`}
      </p>
      {attempt.outcomeUnknown ? <StatusChip status="overdue" label="Outcome unknown" /> : null}
      {attempt.anomaly === null ? null : (
        <p role="alert">{`Anomaly: ${attempt.anomaly.replaceAll('_', ' ')}`}</p>
      )}
      {attempt.lastCheckError === null ? null : (
        <p>{`Last check with the processor failed: ${attempt.lastCheckError}`}</p>
      )}
      <p>{`Processor: ${account?.processor ?? 'unknown'} (${account?.mode ?? ''}).`}</p>
      {account?.processor === 'simulated' ? (
        <p role="note">
          SIMULATED: this attempt is on the simulated processor. No card is charged.
        </p>
      ) : null}
      {account?.processor === 'simulated' &&
      attempt.channel === 'card_online' &&
      open &&
      attempt.processorObjectId !== null ? (
        <p>
          <Link
            href={`/dev/checkout/${attempt.processorObjectId}`}
            className="text-action underline"
          >
            Open the simulated checkout
          </Link>
        </p>
      ) : null}
      <h2>History</h2>
      <ul>
        {transitions.map((t) => (
          <li
            key={t.id}
          >{`${t.at.toISOString()}: ${t.fromState} to ${t.toState} (${t.source})`}</li>
        ))}
      </ul>
      <ActionForm action={checkWithProcessorAction} submitLabel="Check with processor">
        <input type="hidden" name="attemptId" value={attempt.id} />
      </ActionForm>
      {open ? (
        <ActionForm action={voidAttemptAction} submitLabel="Void this attempt">
          <input type="hidden" name="attemptId" value={attempt.id} />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
    </main>
  )
}
