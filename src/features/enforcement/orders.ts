import { civilDateSchema } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { enforcementCases, enforcementOrders, violationFindings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { nextEnforcementNumber } from '@/features/enforcement/numbering'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { err, ok, type Result } from '@/types/result'

export {
  type IssueOrderError,
  issueOrder,
  issuerAuthorized,
} from '@/features/enforcement/orderIssue'

const DraftSchema = z.object({
  caseId: z.string().uuid(),
  findingIds: z.array(z.string().uuid()).min(1),
  correctiveAction: z.string().max(5000),
  correctiveDeadline: civilDateSchema.nullable(),
  ceaseImmediately: z.boolean(),
})

export type OrderRuleKey = 'nh.enf.cd_zoning' | 'nh.enf.cd_building'

export function orderRuleKeyFor(kinds: readonly string[]): OrderRuleKey | 'split_required' {
  const building = kinds.filter((k) => k === 'building_code').length
  if (building === kinds.length) return 'nh.enf.cd_building'
  return building === 0 ? 'nh.enf.cd_zoning' : 'split_required'
}

export async function draftOrder(
  db: Db,
  actor: Actor,
  input: z.input<typeof DraftSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { orderId: string; number: string; ruleKey: OrderRuleKey },
    'forbidden' | 'invalid' | 'not_found' | 'findings_invalid' | 'split_required'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = DraftSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [caseRow] = await tx
      .select({ id: enforcementCases.id })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, value.caseId))
      .for('update')
    if (caseRow === undefined) return err('not_found')
    const findings = await tx
      .select()
      .from(violationFindings)
      .where(
        and(
          inArray(violationFindings.id, value.findingIds),
          eq(violationFindings.caseId, value.caseId),
          eq(violationFindings.status, 'open'),
        ),
      )
    if (findings.length !== new Set(value.findingIds).size) return err('findings_invalid')
    const ruleKey = orderRuleKeyFor(findings.map((f) => f.provisionKind))
    if (ruleKey === 'split_required') return err('split_required')
    const rule = ruleByKey(loadPack(), ruleKey)
    const { number } = await nextEnforcementNumber(tx, 'CD', now, signal)
    const [row] = await tx
      .insert(enforcementOrders)
      .values({
        caseId: value.caseId,
        number,
        ruleKey,
        ruleVersion: rule.version,
        findingIds: value.findingIds,
        correctiveAction: value.correctiveAction,
        correctiveDeadline: value.correctiveDeadline,
        ceaseImmediately: value.ceaseImmediately,
        draftedBy: actor.userId,
      })
      .returning({ id: enforcementOrders.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.order_drafted',
        entityType: 'enforcement_order',
        entityId: row?.id ?? '',
        after: { number, ruleKey },
      },
      signal,
    )
    return ok({ orderId: row?.id ?? '', number, ruleKey })
  })
}

const ReviseSchema = z.object({
  orderId: z.string().uuid(),
  expectedRowVersion: z.number().int(),
  correctiveAction: z.string().max(5000),
  correctiveDeadline: civilDateSchema.nullable(),
  ceaseImmediately: z.boolean(),
})

type DraftChangeError = 'forbidden' | 'invalid' | 'not_found' | 'not_a_draft' | 'stale_version'

async function changeDraft(
  db: Db,
  actor: Actor,
  input: { orderId: string; expectedRowVersion: number },
  signal: AbortSignal,
  change: Partial<typeof enforcementOrders.$inferInsert>,
  action: string,
): Promise<Result<void, DraftChangeError>> {
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<void, DraftChangeError>(db, async (tx) => {
    const [order] = await tx
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, input.orderId))
      .for('update')
    if (order === undefined) return err('not_found')
    if (order.status !== 'draft') return err('not_a_draft')
    if (order.rowVersion !== input.expectedRowVersion) return err('stale_version')
    await tx
      .update(enforcementOrders)
      .set({ ...change, rowVersion: order.rowVersion + 1 })
      .where(eq(enforcementOrders.id, order.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action,
        entityType: 'enforcement_order',
        entityId: order.id,
        after: { number: order.number },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function reviseDraftOrder(
  db: Db,
  actor: Actor,
  input: z.input<typeof ReviseSchema>,
  signal: AbortSignal,
): Promise<Result<void, DraftChangeError>> {
  signal.throwIfAborted()
  const parsed = ReviseSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const { correctiveAction, correctiveDeadline, ceaseImmediately } = parsed.data
  return await changeDraft(
    db,
    actor,
    parsed.data,
    signal,
    { correctiveAction, correctiveDeadline, ceaseImmediately },
    'enforcement.order_draft_revised',
  )
}

export async function discardDraftOrder(
  db: Db,
  actor: Actor,
  input: { orderId: string; expectedRowVersion: number },
  signal: AbortSignal,
): Promise<Result<void, DraftChangeError>> {
  signal.throwIfAborted()
  return await changeDraft(
    db,
    actor,
    input,
    signal,
    { status: 'withdrawn' },
    'enforcement.order_draft_discarded',
  )
}
