import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications, projects } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import type { FieldError, FieldValue } from '@/features/forms/validateSubmission'
import { assessCorrection } from '@/features/permits/correction/assessCorrection'
import type { CorrectionDraft } from '@/features/permits/correction/checkCorrection'
import {
  activeParties,
  applyContractorPlan,
  type ContractorError,
  type ContractorPlan,
  currentContractor,
  type PartyRow,
  planContractor,
  resolveAddedAccount,
} from '@/features/permits/correction/contractor'
import { storeCorrectedPermit } from '@/features/permits/correction/correctionDocuments'
import { isCorrectablePermit, mayCorrectPermits } from '@/features/permits/correction/policy'
import { correctionRecipients, notifyCorrection } from '@/features/permits/correction/recipients'
import { captureSnapshot } from '@/features/snapshots/captureSnapshot'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export interface CorrectionInput extends CorrectionDraft {
  projectTitle: string
  reason: string
}

export type CorrectionError =
  | 'forbidden'
  | 'not_found'
  | 'not_correctable'
  | 'reason_required'
  | 'title_required'
  | 'fee_change'
  | ContractorError
  | { review: string[] }
  | { fieldErrors: FieldError[] }

export interface CorrectionDeps {
  store?: ObjectStore
  now?: Date
}

interface Change {
  app: ApplicationContext
  values: Record<string, FieldValue>
  parties: PartyRow[]
  plan: ContractorPlan
  revision: number
}

async function projectTitleOf(tx: Tx, projectId: string): Promise<string> {
  const [row] = await tx
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
  return row?.title ?? ''
}

function contractorAfter(change: Change): string | null {
  if (change.plan.added !== null) return change.plan.added.name
  const removed = new Set(change.plan.removed.map((p) => p.id))
  return currentContractor(change.parties.filter((p) => !removed.has(p.id)))?.name ?? null
}

async function writeChange(
  tx: Tx,
  actor: Actor,
  input: CorrectionInput,
  change: Change,
  today: string,
  signal: AbortSignal,
): Promise<void> {
  const { app, values, revision } = change
  const title = await projectTitleOf(tx, app.projectId)
  await tx
    .update(applications)
    .set({
      values,
      permitRevision: revision,
      permitCorrectedOn: today,
      rowVersion: app.rowVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, app.id))
  await tx
    .update(projects)
    .set({ title: input.projectTitle.trim() })
    .where(eq(projects.id, app.projectId))
  await applyContractorPlan(tx, actor, app.projectId, change.plan, signal)
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'permit.correct',
      entityType: 'application',
      entityId: app.id,
      before: {
        values: app.values,
        projectTitle: title,
        contractor: currentContractor(change.parties)?.name ?? null,
        revision: app.permitRevision,
      },
      after: {
        values,
        projectTitle: input.projectTitle.trim(),
        contractor: contractorAfter(change),
        revision,
        reason: input.reason.trim(),
      },
    },
    signal,
  )
}

async function prepare(
  tx: Tx,
  input: CorrectionInput,
  signal: AbortSignal,
): Promise<Result<Change, CorrectionError>> {
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for('update')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!isCorrectablePermit(app)) return err('not_correctable')
  const assessed = await assessCorrection(tx, app, input.values, signal)
  if (!assessed.ok) return assessed
  if (assessed.value.review.length > 0) return err({ review: assessed.value.review })
  if (assessed.value.feeChange) return err('fee_change')
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, app.projectId))
    .for('update')
  const parties = await activeParties(tx, app.projectId)
  const plan = planContractor(parties, input.contractor)
  if (!plan.ok) return plan
  const revision = app.permitRevision + 1
  const resolved = await resolveAddedAccount(tx, plan.value, tx)
  return ok({ app, values: assessed.value.values, parties, plan: resolved, revision })
}

export async function correctPermit(
  db: Db,
  actor: Actor,
  input: CorrectionInput,
  signal: AbortSignal,
  deps: CorrectionDeps = {},
): Promise<Result<{ revision: number; documentId: string }, CorrectionError>> {
  signal.throwIfAborted()
  if (!(await mayCorrectPermits(db, actor, signal))) return err('forbidden')
  if (input.reason.trim() === '') return err('reason_required')
  if (input.projectTitle.trim() === '') return err('title_required')
  const store = deps.store ?? getObjectStore()
  const now = deps.now ?? new Date()
  return await transactionResult(db, async (tx) => {
    const prepared = await prepare(tx, input, signal)
    if (!prepared.ok) return prepared
    const change = prepared.value
    const today = await townToday(tx, now, signal)
    await writeChange(tx, actor, input, change, today, signal)
    await captureSnapshot(tx, change.app.id, 'correction', actor, signal, store, now)
    const documentId = await storeCorrectedPermit(
      tx,
      actor,
      { applicationId: change.app.id, store },
      signal,
    )
    const recipients = correctionRecipients(change.parties, change.plan)
    await notifyCorrection(tx, change.app.id, { recipients, revision: change.revision }, signal)
    return ok({ revision: change.revision, documentId })
  })
}
