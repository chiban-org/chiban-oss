import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications, attestations } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { applyTransition } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import {
  extractFacts,
  type FieldError,
  type FieldValue,
  validateSubmission,
} from '@/features/forms/validateSubmission'
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
  const formBody = form?.body as FormBody
  const staff = hasFullRecordAccess(actor)
  const values = staff
    ? checked.value.values
    : keepStaffOnlyValues(formBody, app.values, checked.value.values)
  const facts = staff ? checked.value.facts : extractFacts(formBody, values)
  return await transactionResult<{ state: 'submitted' }, SubmitError>(db, async (tx) => {
    const today = await townToday(tx, now, signal)
    await tx
      .update(applications)
      .set({ values, facts, receivedDate: today })
      .where(eq(applications.id, input.applicationId))
    await tx.insert(attestations).values({
      applicationId: input.applicationId,
      userId: actor.userId,
      statementText: statement,
      statementSha256: input.attestation.statementSha256,
    })
    const moved = await applyTransition(
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
    if (!moved.ok) return err('invalid_transition')
    return ok({ state: 'submitted' })
  })
}

const OPEN_FOR_APPLICANT: readonly CoreState[] = ['draft', 'submitted']
const OPEN_AFTER_REVIEW: readonly CoreState[] = ['under_review', 'decided', 'issued', 'suspended']

type AmendError = 'forbidden' | 'not_found' | 'not_amendable' | { fieldErrors: FieldError[] }

async function amendPermission(
  tx: Tx,
  actor: Actor,
  app: ApplicationContext,
  signal: AbortSignal,
): Promise<'ok' | 'forbidden' | 'not_amendable'> {
  const early = OPEN_FOR_APPLICANT.includes(app.state)
  if (!early && !OPEN_AFTER_REVIEW.includes(app.state)) return 'not_amendable'
  const permitted = early
    ? hasFullRecordAccess(actor) || (await isActiveParty(tx, actor.userId, app.projectId))
    : await hasCapability(tx, actor.userId, 'application.amend_after_review', signal)
  return permitted ? 'ok' : 'forbidden'
}

function keepStaffOnlyValues(
  form: FormBody,
  existing: Record<string, FieldValue>,
  incoming: Record<string, FieldValue>,
): Record<string, FieldValue> {
  const merged = { ...incoming }
  for (const field of form.fields) {
    const kept = existing[field.key]
    if (field.staffOnly === true && kept !== undefined) merged[field.key] = kept
  }
  return merged
}

export async function amendApplication(
  db: Db,
  actor: Actor,
  input: { applicationId: string; values: Record<string, unknown> },
  signal: AbortSignal,
): Promise<Result<void, AmendError>> {
  signal.throwIfAborted()
  return await transactionResult<void, AmendError>(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const verdict = await amendPermission(tx, actor, app, signal)
    if (verdict !== 'ok') return err(verdict)
    const form = await getVersion(tx, app.pins.form, signal)
    const formBody = form?.body as FormBody
    const asStaff = hasFullRecordAccess(actor)
    const checked = validateSubmission(formBody, input.values, { asStaff })
    if (!checked.ok) return err({ fieldErrors: checked.error })
    const values = asStaff
      ? checked.value.values
      : keepStaffOnlyValues(formBody, app.values, checked.value.values)
    await tx
      .update(applications)
      .set({
        values,
        facts: asStaff ? checked.value.facts : extractFacts(formBody, values),
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
        after: { values },
      },
      signal,
    )
    return ok(undefined)
  })
}
