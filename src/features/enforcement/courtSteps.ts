import { type ClockRule, civilDateSchema } from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import {
  COURT_STEP_KINDS,
  documents,
  enforcementCases,
  enforcementOrders,
  JUDGMENT_OUTCOMES,
  orderCourtSteps,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeSubjectDue, type SubjectDue } from '@/features/clocks/subjectDue'
import { answerDueOf } from '@/features/enforcement/answers'
import { type MotionBlock, motionBlocks } from '@/features/enforcement/motionGate'
import { enforcementRulesFor } from '@/features/enforcement/ruleLinks'
import { loadServiceState, orderRule, statusOf } from '@/features/enforcement/service'
import { type StayState, stayFor } from '@/features/enforcement/stay'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const CourtStepSchema = z
  .object({
    orderId: z.string().uuid(),
    kind: z.enum(COURT_STEP_KINDS),
    occurredOn: civilDateSchema,
    court: z.string().trim().min(1).max(200),
    docket: z.string().trim().min(1).max(100).optional(),
    documentId: z.string().uuid(),
    judgmentOutcome: z.enum(JUDGMENT_OUTCOMES).optional(),
  })
  .refine((v) => (v.kind === 'judgment') === (v.judgmentOutcome !== undefined))

export type CourtStepError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'order_not_issued'
  | 'order_not_active'
  | 'date_before_motion'
  | 'date_in_future'
  | 'proof_required'
  | 'filing_needs_complete_service'
  | 'motion_required'
  | MotionBlock

const INACTIVE_STATUSES: readonly string[] = ['annulled', 'withdrawn', 'complied']

const STEP_ORDER_STATUS = {
  filed_with_clerk: 'filed_with_court',
  motion_to_enforce: 'motion_filed',
} as const

function orderStatusAfter(
  kind: (typeof COURT_STEP_KINDS)[number],
  outcome: (typeof JUDGMENT_OUTCOMES)[number] | undefined,
): 'filed_with_court' | 'motion_filed' | 'judgment' | 'annulled' {
  if (kind !== 'judgment') return STEP_ORDER_STATUS[kind]
  return outcome === 'annulled' ? 'annulled' : 'judgment'
}

function firstMotionBlock(input: {
  rule: ReturnType<typeof orderRule>
  status: ReturnType<typeof statusOf>
  state: Awaited<ReturnType<typeof loadServiceState>>
  filedOn: string | null
  stay: StayState
  today: CivilDate
}): MotionBlock | undefined {
  const recipients = input.state.recipients.map((r) => ({
    answerDue: answerDueOf(r.row),
    answeredOn: r.row.answeredOn as CivilDate | null,
    served: input.status.servedOn[r.id] !== undefined,
  }))
  return motionBlocks({
    rule: input.rule,
    status: input.status,
    recipients,
    filedWithClerkOn: input.filedOn as CivilDate | null,
    stay: input.stay,
    today: input.today,
  })[0]
}

async function validCourtDocument(tx: Tx, caseId: string, documentId: string): Promise<boolean> {
  const [doc] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.recordKind, 'enforcement_case'),
        eq(documents.recordId, caseId),
        eq(documents.docKind, 'court_document'),
      ),
    )
  return doc !== undefined
}

function judgmentAppealDue(rule: ClockRule, on: CivilDate): SubjectDue {
  return computeSubjectDue(rule, on, {
    holidays: packHolidayCalendar(),
    packVersion: loadPack().version,
    citations: PACK_COUNTING_CITATIONS,
  })
}

interface StepContext {
  value: z.output<typeof CourtStepSchema>
  rule: ReturnType<typeof orderRule>
  status: ReturnType<typeof statusOf>
  state: Awaited<ReturnType<typeof loadServiceState>>
  steps: (typeof orderCourtSteps.$inferSelect)[]
  filedOn: string | null
  stay: StayState
}

function stepRefusal(c: StepContext): CourtStepError | null {
  const { value } = c
  if (value.kind !== 'judgment' && c.stay.stayed) return 'stayed'
  if (value.kind === 'filed_with_clerk')
    return c.status.complete ? null : 'filing_needs_complete_service'
  if (value.kind === 'motion_to_enforce') {
    return (
      firstMotionBlock({
        rule: c.rule,
        status: c.status,
        state: c.state,
        filedOn: c.filedOn,
        stay: c.stay,
        today: value.occurredOn,
      }) ?? null
    )
  }
  const motion = c.steps.find((s) => s.kind === 'motion_to_enforce')
  if (motion === undefined) return 'motion_required'
  return value.occurredOn < motion.occurredOn ? 'date_before_motion' : null
}

export async function recordCourtStep(
  db: Db,
  actor: Actor,
  input: z.input<typeof CourtStepSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ stepId: string }, CourtStepError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = CourtStepSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ stepId: string }, CourtStepError>(db, async (tx) => {
    const [order] = await tx
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, value.orderId))
      .for('update')
    if (order === undefined) return err('not_found')
    if (order.status === 'draft') return err('order_not_issued')
    if (INACTIVE_STATUSES.includes(order.status)) return err('order_not_active')
    if (value.occurredOn > (await townToday(tx, now, signal))) return err('date_in_future')
    if (!(await validCourtDocument(tx, order.caseId, value.documentId)))
      return err('proof_required')
    const rule = orderRule(order)
    const state = await loadServiceState(tx, order.id, signal)
    const status = statusOf(rule, state)
    const steps = await tx
      .select()
      .from(orderCourtSteps)
      .where(eq(orderCourtSteps.orderId, order.id))
    const filedOn =
      steps
        .filter((s) => s.kind === 'filed_with_clerk')
        .map((s) => s.occurredOn)
        .sort()[0] ?? null
    const stay = await stayFor(tx, order.caseId, value.occurredOn, signal)
    const refusal = stepRefusal({ value, rule, status, state, steps, filedOn, stay })
    if (refusal !== null) return err(refusal)
    const appealDue =
      value.kind === 'judgment'
        ? judgmentAppealDue(enforcementRulesFor(rule).judgmentAppeal, value.occurredOn)
        : null
    const [row] = await tx
      .insert(orderCourtSteps)
      .values({
        orderId: order.id,
        kind: value.kind,
        occurredOn: value.occurredOn,
        court: value.court,
        docket: value.docket ?? null,
        documentId: value.documentId,
        judgmentOutcome: value.judgmentOutcome ?? null,
        appealDue,
        recordedBy: actor.userId,
      })
      .returning({ id: orderCourtSteps.id })
    const nextStatus = orderStatusAfter(value.kind, value.judgmentOutcome)
    await tx
      .update(enforcementOrders)
      .set({ status: nextStatus, rowVersion: order.rowVersion + 1 })
      .where(eq(enforcementOrders.id, order.id))
    await tx
      .update(enforcementCases)
      .set({ status: 'in_court', updatedAt: new Date() })
      .where(
        and(eq(enforcementCases.id, order.caseId), eq(enforcementCases.status, 'order_issued')),
      )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.court_step',
        entityType: 'enforcement_order',
        entityId: order.id,
        after: { stepId: row?.id, kind: value.kind, occurredOn: value.occurredOn },
      },
      signal,
    )
    return ok({ stepId: row?.id ?? '' })
  })
}
