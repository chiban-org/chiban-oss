import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications, inspectionItemResults, inspections } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isSuspended } from '@/features/appeals/suspension'
import type { CoreState } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { getVersion } from '@/features/config/store'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import { applyPassedFinal } from '@/features/inspections/closeOnFinal'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { recordsInspection } from '@/features/inspections/visibility'
import { INSPECTION_PARTY_ROLES, queueForParties } from '@/features/notifications/queue'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const MIN_FAIL_NOTES = 10

export interface ItemOutcomeInput {
  itemKey: string
  outcome: 'pass' | 'fail' | 'na'
  note?: string
}

export interface RecordResultInput {
  inspectionId: string
  result: 'passed' | 'failed'
  notes?: string
  items: ItemOutcomeInput[]
  expectedRowVersion: number
}

export type RecordResultError =
  | 'not_found'
  | 'forbidden'
  | 'not_assigned'
  | 'not_scheduled'
  | 'permit_suspended'
  | 'unknown_item'
  | 'result_conflicts_items'
  | 'notes_required'
  | 'stale_version'
  | { gateBlocked: GateResult[] }

export interface RecordResultOutcome {
  applicationState: CoreState
  closed: boolean
}

function itemsConflict(input: RecordResultInput, checklist: ChecklistBody): boolean {
  const byKey = new Map(input.items.map((i) => [i.itemKey, i.outcome]))
  if (input.result === 'passed') {
    const requiredOk = checklist.items.every((i) => !i.required || byKey.get(i.key) === 'pass')
    return !requiredOk || input.items.some((i) => i.outcome === 'fail')
  }
  return !input.items.some((i) => i.outcome === 'fail')
}

function hasUnknownItem(input: RecordResultInput, checklist: ChecklistBody): boolean {
  const known = new Set(checklist.items.map((i) => i.key))
  const seen = new Set<string>()
  for (const item of input.items) {
    if (!known.has(item.itemKey) || seen.has(item.itemKey)) return true
    seen.add(item.itemKey)
  }
  return false
}

async function storeItems(
  tx: Tx,
  inspectionId: string,
  input: RecordResultInput,
  checklist: ChecklistBody,
): Promise<void> {
  const defs = new Map(checklist.items.map((i) => [i.key, i]))
  await tx.delete(inspectionItemResults).where(eq(inspectionItemResults.inspectionId, inspectionId))
  if (input.items.length === 0) return
  await tx.insert(inspectionItemResults).values(
    input.items.map((item) => ({
      inspectionId,
      itemKey: item.itemKey,
      labelSnapshot: defs.get(item.itemKey)?.label ?? item.itemKey,
      required: defs.get(item.itemKey)?.required ?? false,
      outcome: item.outcome,
      note: item.note ?? null,
    })),
  )
}

interface Prepared {
  locked: typeof inspections.$inferSelect
  checklist: ChecklistBody
  appState: string
}

async function prepare(
  tx: Tx,
  actor: Actor,
  input: RecordResultInput,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<Prepared, RecordResultError>> {
  const [locked] = await tx
    .select()
    .from(inspections)
    .where(eq(inspections.id, input.inspectionId))
    .for('update')
  if (locked === undefined) return err('not_found')
  if (locked.rowVersion !== input.expectedRowVersion) return err('stale_version')
  if (locked.status !== 'scheduled') return err('not_scheduled')
  if (!recordsInspection(actor, locked.inspectorUserId)) return err('not_assigned')
  const [app] = await tx
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, locked.applicationId))
  if (app?.state === 'suspended' || (await isSuspended(tx, locked.applicationId, signal))) {
    return err('permit_suspended')
  }
  if (locked.scheduledDate === null || today < locked.scheduledDate) return err('not_scheduled')
  const version = await getVersion(tx, locked.checklistVersionId, signal)
  if (version === null) return err('not_found')
  const checklist = version.body as ChecklistBody
  if (hasUnknownItem(input, checklist)) return err('unknown_item')
  if (itemsConflict(input, checklist)) return err('result_conflicts_items')
  const notes = input.notes?.trim() ?? ''
  if (input.result === 'failed' && notes.length < MIN_FAIL_NOTES) return err('notes_required')
  return ok({ locked, checklist, appState: app?.state ?? 'issued' })
}

async function recordInTransaction(
  tx: Tx,
  actor: Actor,
  input: RecordResultInput,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<RecordResultOutcome, RecordResultError>> {
  const prepared = await prepare(tx, actor, input, today, signal)
  if (!prepared.ok) return prepared
  const { locked, checklist, appState } = prepared.value
  const notes = input.notes?.trim() ?? ''
  await storeItems(tx, locked.id, input, checklist)
  await tx
    .update(inspections)
    .set({
      status: input.result,
      resultNotes: notes === '' ? null : notes,
      resultRecordedBy: actor.userId,
      resultRecordedAt: new Date(),
      rowVersion: locked.rowVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(inspections.id, locked.id))
  const outcome =
    input.result === 'passed' && locked.isFinal
      ? await applyPassedFinal(tx, actor, locked.applicationId, today, signal)
      : ok({ applicationState: appState as CoreState, closed: false })
  if (!outcome.ok) return err(outcome.error === 'forbidden' ? 'forbidden' : outcome.error)
  await queueForParties(
    tx,
    {
      event: 'inspection_result',
      applicationId: locked.applicationId,
      discriminator: `${locked.id}:result`,
      extra: {
        inspectionLabel: inspectionTypeLabel(locked.inspectionType),
        result: input.result,
      },
      roles: INSPECTION_PARTY_ROLES,
    },
    signal,
  )
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'inspection.result',
      entityType: 'inspection',
      entityId: locked.id,
      after: { result: input.result, closed: outcome.value.closed },
    },
    signal,
  )
  return outcome
}

export async function recordInspectionResult(
  db: Db,
  actor: Actor,
  input: RecordResultInput,
  signal: AbortSignal,
  deps: { now?: Date } = {},
): Promise<Result<RecordResultOutcome, RecordResultError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'inspection.record', signal)
  if (!allowed.ok) return err('forbidden')
  const today = await townToday(db, deps.now ?? new Date(), signal)
  return await transactionResult(db, (tx) => recordInTransaction(tx, actor, input, today, signal))
}
