import { type CeaseAndDesistRule, civilDateSchema, type OrderContentField } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import {
  type EnforcementStatus,
  enforcementCases,
  enforcementOrders,
  users,
  violationFindings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import { designationOn } from '@/features/enforcement/designations'
import { nextEnforcementNumber } from '@/features/enforcement/numbering'
import { missingOrderContent, renderOrderPdf } from '@/features/enforcement/orderPdf'
import { stayFor } from '@/features/enforcement/stay'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { ObjectStore } from '@/features/storage/objectStore'
import { getTownSettings } from '@/features/town/settings'
import { err, ok, type Result } from '@/types/result'

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

const ORDERABLE_STATUSES: readonly EnforcementStatus[] = ['violation_found', 'order_issued']
const PAST_ORDER_STATUSES: readonly EnforcementStatus[] = ['in_court', 'resolved', 'closed']

export function issuerAuthorized(rule: CeaseAndDesistRule, designated: boolean): boolean {
  return designated || !rule.issuerMustBeDesignated
}

export type IssueOrderError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'not_a_draft'
  | 'stale_version'
  | 'case_not_ready'
  | 'case_past_orders'
  | 'stayed'
  | 'not_designated'
  | 'deadline_before_issue'
  | { missingContent: OrderContentField[] }

const IssueSchema = z.object({
  orderId: z.string().uuid(),
  issuedOn: civilDateSchema,
  expectedRowVersion: z.number().int(),
})

export async function issueOrder(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: z.input<typeof IssueSchema>,
  signal: AbortSignal,
  _now: Date = new Date(),
): Promise<Result<{ documentId: string }, IssueOrderError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.issue_order', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = IssueSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ documentId: string }, IssueOrderError>(db, async (tx) => {
    const [order] = await tx
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, value.orderId))
      .for('update')
    if (order === undefined) return err('not_found')
    if (order.status !== 'draft') return err('not_a_draft')
    if (order.rowVersion !== value.expectedRowVersion) return err('stale_version')
    const [caseRow] = await tx
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, order.caseId))
      .for('update')
    if (caseRow === undefined) return err('not_found')
    if ((await stayFor(tx, caseRow.id, value.issuedOn, signal)).stayed) return err('stayed')
    if (PAST_ORDER_STATUSES.includes(caseRow.status)) return err('case_past_orders')
    if (!ORDERABLE_STATUSES.includes(caseRow.status)) return err('case_not_ready')
    const rule = ruleByKey(loadPack(), order.ruleKey, order.ruleVersion)
    if (rule.kind !== 'cease_and_desist') {
      throw new AppError(ErrorIds.ENF_INVARIANT, 'Order rule is not a cease and desist rule', {
        key: order.ruleKey,
      })
    }
    const designation = await designationOn(tx, actor.userId, value.issuedOn)
    if (!issuerAuthorized(rule, designation !== null)) return err('not_designated')
    const findings = await tx
      .select()
      .from(violationFindings)
      .where(inArray(violationFindings.id, order.findingIds))
    const missing = missingOrderContent(rule, {
      findings,
      correctiveAction: order.correctiveAction,
      correctiveDeadline: order.correctiveDeadline,
    })
    if (missing.length > 0) return err({ missingContent: missing })
    if (order.correctiveDeadline !== null && order.correctiveDeadline < value.issuedOn) {
      return err('deadline_before_issue')
    }
    const [issuer] = await tx.select().from(users).where(eq(users.id, actor.userId))
    const town = await getTownSettings(tx, signal)
    const bytes = await renderOrderPdf({
      townName: town.ok ? town.value.name : '',
      number: order.number,
      rule,
      locationText: caseRow.locationText,
      findings,
      correctiveAction: order.correctiveAction,
      correctiveDeadline: order.correctiveDeadline,
      ceaseImmediately: order.ceaseImmediately,
      issuedOn: value.issuedOn,
      issuerName: issuer?.displayName ?? '',
      issuerTitle: designation?.title ?? 'Enforcement officer',
    })
    const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'enforcement_case', id: order.caseId },
        title: `Cease and desist order ${order.number}`,
        docKind: 'enforcement_letter',
        file: {
          sha256: stored.sha256,
          filename: `${order.number}.pdf`,
          contentType: 'application/pdf',
        },
      },
      signal,
    )
    await tx
      .update(enforcementOrders)
      .set({
        status: 'issued',
        issuedOn: value.issuedOn,
        issuedBy: actor.userId,
        documentId: attached.documentId,
        rowVersion: order.rowVersion + 1,
      })
      .where(eq(enforcementOrders.id, order.id))
    await tx
      .update(enforcementCases)
      .set({ status: 'order_issued', rowVersion: caseRow.rowVersion + 1, updatedAt: new Date() })
      .where(eq(enforcementCases.id, caseRow.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.order_issued',
        entityType: 'enforcement_order',
        entityId: order.id,
        after: { number: order.number, issuedOn: value.issuedOn, ruleKey: order.ruleKey },
      },
      signal,
    )
    return ok({ documentId: attached.documentId })
  })
}
