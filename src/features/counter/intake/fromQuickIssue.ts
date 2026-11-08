import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { type StartIntakeError, startCounterIntake } from '@/features/counter/intake/startIntake'
import type { QuickIssueError, QuickIssueInput } from '@/features/counter/quickIssue'
import { DOCUMENT_GATE_KEYS } from '@/features/gates/documentGates'
import { saveDraftValues } from '@/features/portal/drafts'
import { err, ok, type Result } from '@/types/result'

export function blockedOnFilingDocuments(error: QuickIssueError): boolean {
  if (typeof error !== 'object' || !('gateBlocked' in error)) return false
  const blocked = error.gateBlocked.filter((g) => g.effective === 'blocked')
  return blocked.length > 0 && blocked.every((g) => g.key === DOCUMENT_GATE_KEYS.submitted)
}

export async function takeQuickIssueForReview(
  db: Db,
  actor: Actor,
  input: QuickIssueInput,
  signal: AbortSignal,
): Promise<Result<{ applicationId: string }, StartIntakeError | 'not_saved'>> {
  const applicant = input.payerName.trim() === '' ? input.contractor.name : input.payerName
  const started = await startCounterIntake(
    db,
    actor,
    {
      parcelId: input.parcelId,
      applicationTypeKey: input.applicationTypeKey,
      applicant: {
        name: applicant,
        ...(input.contractor.email === undefined ? {} : { email: input.contractor.email }),
      },
    },
    signal,
  )
  if (!started.ok) return err(started.error)
  const { applicationId } = started.value
  const values = {
    ...input.values,
    ...(input.license === undefined ? {} : { contractor_license_number: input.license.number }),
  }
  const saved = await saveDraftValues(db, actor, { applicationId, values }, signal)
  return saved.ok ? ok({ applicationId }) : err('not_saved')
}
