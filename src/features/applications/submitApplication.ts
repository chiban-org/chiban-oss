import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, attestations } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import { type FieldError, validateSubmission } from '@/features/forms/validateSubmission'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export function attestationHash(statement: string): string {
  return createHash('sha256').update(statement).digest('hex')
}

export type SubmitError =
  | 'forbidden'
  | 'attestation_mismatch'
  | 'invalid_transition'
  | 'not_found'
  | { fieldErrors: FieldError[] }

async function mayEdit(db: Db, actor: Actor, projectId: string): Promise<boolean> {
  return hasFullRecordAccess(actor) || (await isActiveParty(db, actor.userId, projectId))
}

export async function submitApplication(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    values: Record<string, unknown>
    attestation: { statementSha256: string }
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ state: 'submitted' }, SubmitError>> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!(await mayEdit(db, actor, app.projectId))) return err('forbidden')
  if (app.state !== 'draft') return err('invalid_transition')
  const statement = app.typeBody.attestationText
  if (input.attestation.statementSha256 !== attestationHash(statement))
    return err('attestation_mismatch')
  const form = await getVersion(db, app.pins.form, signal)
  const checked = validateSubmission(form?.body as FormBody, input.values, {
    asStaff: hasFullRecordAccess(actor),
  })
  if (!checked.ok) return err({ fieldErrors: checked.error })
  return await transactionResult<{ state: 'submitted' }, SubmitError>(db, async (tx) => {
    const today = await townToday(tx, now, signal)
    await tx
      .update(applications)
      .set({ values: checked.value.values, facts: checked.value.facts, receivedDate: today })
      .where(eq(applications.id, input.applicationId))
    await tx.insert(attestations).values({
      applicationId: input.applicationId,
      userId: actor.userId,
      statementText: statement,
      statementSha256: input.attestation.statementSha256,
    })
    const moved = await transitionApplication(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        to: 'submitted',
        expectedRowVersion: app.rowVersion,
        onDate: today,
      },
      signal,
      now,
    )
    if (!moved.ok) return err(moved.error === 'forbidden' ? 'forbidden' : 'invalid_transition')
    return ok({ state: 'submitted' })
  })
}

const OPEN_FOR_APPLICANT: readonly CoreState[] = ['draft', 'submitted']
const OPEN_AFTER_REVIEW: readonly CoreState[] = ['under_review', 'decided', 'issued', 'suspended']

export async function amendApplication(
  db: Db,
  actor: Actor,
  input: { applicationId: string; values: Record<string, unknown> },
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'not_found' | 'not_amendable' | { fieldErrors: FieldError[] }>
> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  const early = OPEN_FOR_APPLICANT.includes(app.state)
  if (!early && !OPEN_AFTER_REVIEW.includes(app.state)) return err('not_amendable')
  const permitted = early
    ? await mayEdit(db, actor, app.projectId)
    : await hasCapability(db, actor.userId, 'application.amend_after_review', signal)
  if (!permitted) return err('forbidden')
  const form = await getVersion(db, app.pins.form, signal)
  const checked = validateSubmission(form?.body as FormBody, input.values, {
    asStaff: hasFullRecordAccess(actor),
  })
  if (!checked.ok) return err({ fieldErrors: checked.error })
  return await transactionResult(db, async (tx) => {
    await tx
      .update(applications)
      .set({
        values: checked.value.values,
        facts: checked.value.facts,
        rowVersion: app.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, input.applicationId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'application.amend',
        entityType: 'application',
        entityId: input.applicationId,
        before: { values: app.values },
        after: { values: checked.value.values },
      },
      signal,
    )
    return ok(undefined)
  })
}
