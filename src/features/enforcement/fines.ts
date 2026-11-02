import { type CivilPenaltyRule, civilDateSchema } from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx, Tx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  enforcementFines,
  enforcementOrders,
  FINE_KINDS,
  orderCourtSteps,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { stayFor } from '@/features/enforcement/stay'
import { fineDueCents } from '@/features/ledger/fineDue'
import { loadPack } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

const FineSchema = z.object({
  caseId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  kind: z.enum(FINE_KINDS),
  ruleKey: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  imposedOn: civilDateSchema,
  court: z.string().trim().min(1).max(200),
  docket: z.string().trim().min(1).max(100),
  judgmentStepId: z.string().uuid().optional(),
  counselOutcomeId: z.string().uuid().optional(),
})

export type FineInput = z.input<typeof FineSchema>

export async function fineBalance(
  db: DbOrTx,
  fineId: string,
  signal: AbortSignal,
): Promise<{ imposedCents: number; paidCents: number; dueCents: number }> {
  signal.throwIfAborted()
  const [fine] = await db
    .select({ amountCents: enforcementFines.amountCents })
    .from(enforcementFines)
    .where(eq(enforcementFines.id, fineId))
  const imposedCents = fine?.amountCents ?? 0
  const dueCents = await fineDueCents(db, fineId)
  return { imposedCents, paidCents: imposedCents - dueCents, dueCents }
}

async function judgmentSupports(tx: Tx, value: z.output<typeof FineSchema>): Promise<boolean> {
  if (value.judgmentStepId !== undefined) {
    if (value.orderId === undefined) return false
    const [step] = await tx
      .select({ kind: orderCourtSteps.kind, outcome: orderCourtSteps.judgmentOutcome })
      .from(orderCourtSteps)
      .innerJoin(enforcementOrders, eq(enforcementOrders.id, orderCourtSteps.orderId))
      .where(
        and(
          eq(orderCourtSteps.id, value.judgmentStepId),
          eq(orderCourtSteps.orderId, value.orderId),
          eq(enforcementOrders.caseId, value.caseId),
        ),
      )
    return step?.kind === 'judgment' && step.outcome !== 'annulled'
  }
  if (value.counselOutcomeId === undefined) return false
  const [outcome] = await tx
    .select({ kind: counselOutcomes.kind })
    .from(counselOutcomes)
    .innerJoin(counselReferrals, eq(counselReferrals.id, counselOutcomes.referralId))
    .where(
      and(
        eq(counselOutcomes.id, value.counselOutcomeId),
        eq(counselReferrals.caseId, value.caseId),
      ),
    )
  return outcome?.kind === 'judgment_for_town'
}

function penaltyRuleFor(key: string | undefined): CivilPenaltyRule | null {
  if (key === undefined) return null
  const rule = loadPack().rules.find((r) => r.key === key)
  return rule?.kind === 'civil_penalty' ? rule : null
}

export function finesNeedJudgment(rule: CivilPenaltyRule | null): boolean {
  const imposedBy: string | undefined = rule?.imposedBy
  return imposedBy === undefined || imposedBy === 'court'
}

export async function recordFine(
  db: Db,
  actor: Actor,
  input: FineInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ fineId: string }, 'forbidden' | 'invalid' | 'judgment_required' | 'stayed'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'fine.record', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = FineSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (value.judgmentStepId !== undefined && value.counselOutcomeId !== undefined)
    return err('invalid')
  const penalty = penaltyRuleFor(value.ruleKey)
  if (value.ruleKey !== undefined && penalty === null) return err('invalid')
  return await transactionResult(db, async (tx) => {
    if (finesNeedJudgment(penalty) && !(await judgmentSupports(tx, value))) {
      return err('judgment_required')
    }
    const today = await townToday(tx, now, signal)
    if ((await stayFor(tx, value.caseId, today, signal)).stayed) return err('stayed')
    const [row] = await tx
      .insert(enforcementFines)
      .values({
        caseId: value.caseId,
        orderId: value.orderId ?? null,
        kind: value.kind,
        ruleKey: value.ruleKey ?? null,
        amountCents: value.amountCents,
        imposedOn: value.imposedOn,
        court: value.court,
        docket: value.docket,
        judgmentStepId: value.judgmentStepId ?? null,
        counselOutcomeId: value.counselOutcomeId ?? null,
        recordedBy: actor.userId,
      })
      .returning({ id: enforcementFines.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.fine_recorded',
        entityType: 'enforcement_fine',
        entityId: row?.id ?? '',
        after: { caseId: value.caseId, kind: value.kind, amountCents: value.amountCents },
      },
      signal,
    )
    return ok({ fineId: row?.id ?? '' })
  })
}
