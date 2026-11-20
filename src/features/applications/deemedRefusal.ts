import { and, eq, inArray, lt } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Db, Tx } from '@/db/client'
import { applications, clocks, decisionNotices, deemedRefusals, documents } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { addAdministrativeDecisionTx } from '@/features/appeals/adminAppeals'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { markClockMet } from '@/features/clocks/startClocks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { isAfterTownToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const SYSTEM_ACTOR = { kind: 'system', job: JOB_NAMES.CLOCKS_DAILY } as const
const OPEN_CLOCK = ['running', 'overdue'] as const
const REFUSABLE = ['submitted', 'under_review']
const OWED = ['decided', 'issued']

export type DecisionNoticeError =
  | 'forbidden'
  | 'not_found'
  | 'already_recorded'
  | 'future_date'
  | 'document_not_found'

function isDeemedRefused(ruleKey: string, ruleVersion: number): boolean {
  const rule = ruleByKey(loadPack(), ruleKey, ruleVersion)
  return rule.kind === 'clock' && rule.consequence.kind === 'deemed_refused'
}

export async function recordDecisionNotice(
  db: Db,
  actor: Actor,
  input: { applicationId: string; documentId: string; mailedOn: CivilDate },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DecisionNoticeError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.mailedOn, now, signal)) return err('future_date')
  return await transactionResult<void, DecisionNoticeError>(db, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    if (app === undefined) return err('not_found')
    const [doc] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.recordKind, 'application'),
          eq(documents.recordId, app.id),
        ),
      )
    if (doc === undefined) return err('document_not_found')
    const [existing] = await tx
      .select({ id: decisionNotices.applicationId })
      .from(decisionNotices)
      .where(eq(decisionNotices.applicationId, app.id))
    if (existing !== undefined) return err('already_recorded')
    await tx.insert(decisionNotices).values({
      applicationId: app.id,
      documentId: doc.id,
      mailedOn: input.mailedOn,
      recordedBy: actor.userId,
    })
    const open = await tx
      .select({ ruleKey: clocks.ruleKey, ruleVersion: clocks.ruleVersion })
      .from(clocks)
      .where(and(eq(clocks.applicationId, app.id), inArray(clocks.status, [...OPEN_CLOCK])))
    for (const clock of open) {
      if (isDeemedRefused(clock.ruleKey, clock.ruleVersion)) {
        await markClockMet(tx, app.id, clock.ruleKey, input.mailedOn, signal)
      }
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'application.decision_notice',
        entityType: 'application',
        entityId: app.id,
        after: { documentId: doc.id, mailedOn: input.mailedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

async function lockedCandidate(
  tx: Tx,
  clockId: string,
  applicationId: string,
  today: CivilDate,
): Promise<{ clock: typeof clocks.$inferSelect; app: typeof applications.$inferSelect } | null> {
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update')
  const [clock] = await tx.select().from(clocks).where(eq(clocks.id, clockId)).for('update')
  const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId))
  if (clock === undefined || app === undefined) return null
  const open = OPEN_CLOCK.some((s) => s === clock.status)
  return open && clock.currentDue < today ? { clock, app } : null
}

async function refuse(
  tx: Tx,
  found: { clock: typeof clocks.$inferSelect; app: typeof applications.$inferSelect },
  today: CivilDate,
  signal: AbortSignal,
  move: typeof transitionApplication,
): Promise<string | null> {
  const { clock, app } = found
  await tx.update(clocks).set({ status: 'lapsed' }).where(eq(clocks.id, clock.id))
  const moved = await move(
    tx,
    SYSTEM_ACTOR,
    {
      applicationId: app.id,
      to: 'denied',
      expectedRowVersion: app.rowVersion,
      onDate: today,
      deemedRefusal: true,
    },
    signal,
  )
  if (!moved.ok) {
    await tx.update(clocks).set({ status: clock.status }).where(eq(clocks.id, clock.id))
    return `${app.id}: ${JSON.stringify(moved.error)}`
  }
  await tx.insert(deemedRefusals).values({
    applicationId: app.id,
    ruleKey: clock.ruleKey,
    ruleVersion: clock.ruleVersion,
    dueOn: clock.currentDue,
    firedOn: today,
  })
  await writeAudit(
    tx,
    {
      actor: SYSTEM_ACTOR,
      action: 'application.deemed_refusal',
      entityType: 'application',
      entityId: app.id,
      after: { ruleKey: clock.ruleKey, dueOn: clock.currentDue, firedOn: today },
    },
    signal,
  )
  await addAdministrativeDecisionTx(
    tx,
    { applicationId: app.id, occurredOn: today, createdBy: null },
    signal,
  )
  return null
}

export async function refuseBySilence(
  tx: Tx,
  today: CivilDate,
  signal: AbortSignal,
  move: typeof transitionApplication = transitionApplication,
): Promise<{ refused: string[]; noticeOverdue: string[]; failures: string[] }> {
  signal.throwIfAborted()
  const past = await tx
    .select({ clock: clocks, state: applications.state })
    .from(clocks)
    .innerJoin(applications, eq(applications.id, clocks.applicationId))
    .where(and(inArray(clocks.status, [...OPEN_CLOCK]), lt(clocks.currentDue, today)))
  const refused: string[] = []
  const noticeOverdue: string[] = []
  const failures: string[] = []
  for (const { clock, state } of past) {
    if (!isDeemedRefused(clock.ruleKey, clock.ruleVersion)) continue
    if (OWED.includes(state)) {
      if (!noticeOverdue.includes(clock.applicationId)) noticeOverdue.push(clock.applicationId)
      continue
    }
    if (!REFUSABLE.includes(state)) continue
    const found = await lockedCandidate(tx, clock.id, clock.applicationId, today)
    if (found === null || !REFUSABLE.includes(found.app.state)) continue
    const failure = await refuse(tx, found, today, signal, move)
    if (failure === null) refused.push(clock.applicationId)
    else failures.push(failure)
  }
  return { refused, noticeOverdue, failures }
}
