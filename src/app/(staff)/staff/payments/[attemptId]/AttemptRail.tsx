import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import type { paymentAttempts } from '@/db/schema'
import type { Status } from '@/features/design/tokens'
import { attemptStateLabel, channelLabel } from '@/features/payments/labels'
import { words } from '@/lib/words'
import { checkWithProcessorAction, voidAttemptAction } from '../actions'
import { ManualOutcomeForm } from './ManualOutcomeForm'

type Attempt = typeof paymentAttempts.$inferSelect

export interface AttemptViewer {
  canCheck: boolean
  canVoid: boolean
  canRecordOutcome: boolean
}

export interface AttemptLinks {
  processor: string | null
  receipt: { id: string; number: string } | null
}

const STATE_CHIP: Record<Attempt['state'], Status> = {
  pending: 'neutral',
  authorized: 'neutral',
  captured: 'passed',
  settled: 'passed',
  declined: 'failed',
  voided: 'neutral',
}

export function isOpen(attempt: Attempt): boolean {
  return attempt.state === 'pending' || attempt.state === 'authorized'
}

function guidance(attempt: Attempt, viewer: AttemptViewer): string | null {
  if (viewer.canRecordOutcome) {
    return 'The processor has not confirmed this payment for over a day. Once it confirms the outcome by phone or in its dashboard, record it here.'
  }
  if (attempt.outcomeUnknown) return 'Check with the processor before voiding.'
  if (attempt.anomaly !== null) return 'Check with the processor to see what it recorded.'
  return null
}

function attemptFacts(attempt: Attempt, links: AttemptLinks): Fact[] {
  const facts: Fact[] = [{ label: 'Paid by', value: channelLabel(attempt.channel) }]
  if (links.processor !== null) facts.push({ label: 'Processor', value: links.processor })
  if (links.receipt !== null) {
    facts.push({
      label: 'Receipt',
      value: (
        <Link
          {...NEW_TAB}
          href={`/staff/receipts/${links.receipt.id}`}
          className="text-action underline"
        >
          {links.receipt.number}
        </Link>
      ),
    })
  }
  return facts
}

function Actions({ attempt, viewer }: { attempt: Attempt; viewer: AttemptViewer }) {
  const next = guidance(attempt, viewer)
  const mayVoid = isOpen(attempt) && viewer.canVoid
  if (next === null && !viewer.canCheck && !mayVoid && !viewer.canRecordOutcome) return null
  return (
    <div className="rail-card">
      <NextStep>
        {next === null ? null : <p>{next}</p>}
        {attempt.lastCheckError === null ? null : (
          <p>{`Last check with the processor failed: ${attempt.lastCheckError}`}</p>
        )}
        {viewer.canCheck ? (
          <ActionForm action={checkWithProcessorAction} submitLabel="Check with processor">
            <input type="hidden" name="attemptId" value={attempt.id} />
          </ActionForm>
        ) : null}
        {viewer.canRecordOutcome ? <ManualOutcomeForm attempt={attempt} /> : null}
        {mayVoid ? (
          <ActionForm action={voidAttemptAction} submitLabel="Void this attempt">
            <input type="hidden" name="attemptId" value={attempt.id} />
            <TextField label="Reason (at least 10 characters)" name="reason" required />
          </ActionForm>
        ) : null}
      </NextStep>
    </div>
  )
}

export function AttemptRail({
  attempt,
  viewer,
  links,
}: {
  attempt: Attempt
  viewer: AttemptViewer
  links: AttemptLinks
}) {
  return (
    <>
      <div className="rail-card">
        <div className="flex flex-wrap gap-2">
          <StatusChip status={STATE_CHIP[attempt.state]} label={attemptStateLabel(attempt.state)} />
          {attempt.outcomeUnknown ? <StatusChip status="overdue" label="Outcome unknown" /> : null}
          {attempt.anomaly === null ? null : (
            <StatusChip status="failed" label={words(attempt.anomaly)} />
          )}
        </div>
        <FactList facts={attemptFacts(attempt, links)} stacked />
      </div>
      <Actions attempt={attempt} viewer={viewer} />
    </>
  )
}
