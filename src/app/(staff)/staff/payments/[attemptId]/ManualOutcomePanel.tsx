import { StatusChip } from '@/components/StatusChip'
import type { paymentAttempts } from '@/db/schema'
import { MANUAL_OUTCOME_LABELS } from '@/features/payments/manualOutcomeCheck'
import { formatInstant } from '@/lib/formatDate'

type Attempt = typeof paymentAttempts.$inferSelect

export function ManualOutcomePanel({
  attempt,
  resolver,
  zone,
}: {
  attempt: Attempt
  resolver: string | null
  zone: string
}) {
  if (attempt.manualOutcome === null) return null
  const when = attempt.manualAt === null ? '' : `, ${formatInstant(attempt.manualAt, zone)}`
  return (
    <section aria-label="Recorded by hand">
      <h2>Outcome recorded by hand</h2>
      <p>{`${MANUAL_OUTCOME_LABELS[attempt.manualOutcome]}. Recorded by ${resolver ?? 'a former staff member'}${when}.`}</p>
      <p>{`Note: ${attempt.manualNote ?? ''}`}</p>
      {attempt.processorMismatch === null ? null : (
        <div role="alert" className="flex flex-col gap-2">
          <StatusChip status="failed" label="Processor disagrees" />
          <p>
            {`The processor later reported this payment as ${attempt.processorMismatch}. The outcome recorded by hand was kept and the ledger was not changed. Review it with the processor.`}
          </p>
        </div>
      )}
    </section>
  )
}
