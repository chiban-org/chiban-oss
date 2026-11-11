import { type CeaseAndDesistRule, civilDateSchema, type OrderContentField } from '@packs/nh/schema'
import { eq, inArray } from 'drizzle-orm'
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
import { contentProblem, issueBlock } from '@/features/enforcement/orderIssueChecks'
import { renderOrderPdf } from '@/features/enforcement/orderPdf'
import { stayFor } from '@/features/enforcement/stay'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { err, ok, type Result } from '@/types/result'

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
  | 'notice_required'
  | { missingContent: OrderContentField[] }
  | { findingsNotOpen: string[] }

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
    const problem = contentProblem(rule, order, findings)
    if (problem !== null) return err(problem)
    const blocked = await issueBlock(tx, order, value.issuedOn)
    if (blocked !== null) return err(blocked)
    const [issuer] = await tx.select().from(users).where(eq(users.id, actor.userId))
    const template = await publishedTemplate(tx, 'enforcement_order', signal)
    const bytes = await renderOrderPdf(
      {
        frame: await documentFrame(tx, {}, signal, store),
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
      },
      template,
    )
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
