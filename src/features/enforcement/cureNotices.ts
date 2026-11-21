import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  cureNotices,
  enforcementCases,
  enforcementOrders,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeSubjectDue } from '@/features/clocks/subjectDue'
import {
  casePlanCure,
  cureClockOf,
  cureRecipientRoles,
  cureRuleByKey,
} from '@/features/enforcement/cureRules'
import { cureStanding } from '@/features/enforcement/cureStanding'
import { packCountingCitations, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack } from '@/features/packs/loadPack'
import type { CureNoticeRule } from '@/features/packs/schema'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

interface Recipient {
  name: string
  mailingAddress: string
}

export async function applyCureProcedure(
  db: Db,
  actor: Actor,
  input: { caseId: string; ruleKey: string | null },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'unknown_rule' | 'notice_sent'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (input.ruleKey !== null && cureRuleByKey(input.ruleKey) === null) return err('unknown_rule')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, input.caseId))
      .for('update')
    if (row === undefined) return err('not_found')
    if (await noticeOrOrderExists(tx, input.caseId)) return err('notice_sent')
    await tx
      .update(enforcementCases)
      .set({ cureRuleKey: input.ruleKey, updatedAt: new Date() })
      .where(eq(enforcementCases.id, input.caseId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.cure_procedure_set',
        entityType: 'enforcement_case',
        entityId: input.caseId,
        before: { cureRuleKey: row.cureRuleKey },
        after: { cureRuleKey: input.ruleKey },
      },
      signal,
    )
    return ok(undefined)
  })
}

async function noticeOrOrderExists(tx: Tx, caseId: string): Promise<boolean> {
  const [[cure], [violation], [order]] = await Promise.all([
    tx
      .select({ id: cureNotices.id })
      .from(cureNotices)
      .where(eq(cureNotices.caseId, caseId))
      .limit(1),
    tx
      .select({ id: violationNotices.id })
      .from(violationNotices)
      .where(eq(violationNotices.caseId, caseId))
      .limit(1),
    tx
      .select({ id: enforcementOrders.id })
      .from(enforcementOrders)
      .where(and(eq(enforcementOrders.caseId, caseId), ne(enforcementOrders.status, 'withdrawn')))
      .limit(1),
  ])
  return cure !== undefined || violation !== undefined || order !== undefined
}

export async function sendCureNotice(
  db: Db,
  actor: Actor,
  input: {
    caseId: string
    findingIds: string[]
    owner: Recipient
    occupant: Recipient | 'none'
    sentOn: CivilDate
    documentId: string | null
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { ids: string[] },
    | 'forbidden'
    | 'not_found'
    | 'no_cure_procedure'
    | 'no_open_findings'
    | 'finding_not_open'
    | 'future_date'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const findingIds = [...new Set(input.findingIds)]
  const today = await townToday(db, now, signal)
  return await transactionResult(db, async (tx) => {
    const [caseRow] = await tx
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, input.caseId))
      .for('update')
    if (caseRow === undefined) return err('not_found')
    const rule = cureRuleByKey(caseRow.cureRuleKey)
    if (rule === null) return err('no_cure_procedure')
    if (findingIds.length === 0) return err('no_open_findings')
    if (compareCivil(input.sentOn, today) > 0) return err('future_date')
    const open = await tx
      .select({ id: violationFindings.id })
      .from(violationFindings)
      .where(
        and(
          inArray(violationFindings.id, findingIds),
          eq(violationFindings.caseId, input.caseId),
          eq(violationFindings.status, 'open'),
        ),
      )
    if (open.length !== findingIds.length) return err('finding_not_open')
    const cureDue = computeSubjectDue(cureClockOf(rule), input.sentOn, {
      holidays: packHolidayCalendar(),
      packVersion: loadPack().version,
      citations: packCountingCitations(),
    })
    const recipients: { role: 'owner' | 'occupant'; name: string; mailingAddress: string }[] = []
    for (const role of cureRecipientRoles(rule, input.occupant !== 'none')) {
      if (role === 'owner') recipients.push({ role, ...input.owner })
      else if (input.occupant !== 'none') recipients.push({ role, ...input.occupant })
    }
    const rows = await tx
      .insert(cureNotices)
      .values(
        recipients.map((r) => ({
          caseId: input.caseId,
          findingIds,
          recipientRole: r.role,
          recipientName: r.name,
          mailingAddress: r.mailingAddress,
          sentOn: input.sentOn,
          documentId: input.documentId,
          cureDue,
          sentBy: actor.userId,
        })),
      )
      .returning({ id: cureNotices.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.cure_notice_sent',
        entityType: 'enforcement_case',
        entityId: input.caseId,
        after: {
          ruleKey: rule.key,
          findingIds,
          recipients: recipients.map((r) => r.role),
          sentOn: input.sentOn,
          due: cureDue.due,
        },
      },
      signal,
    )
    return ok({ ids: rows.map((r) => r.id) })
  })
}

export async function recordCureReturnReceipt(
  db: Db,
  actor: Actor,
  input: { cureNoticeId: string; receivedOn: CivilDate },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, 'forbidden' | 'not_found' | 'before_sent' | 'future_date'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const today = await townToday(db, now, signal)
  return await transactionResult(db, async (tx) => {
    const [before] = await tx
      .select()
      .from(cureNotices)
      .where(eq(cureNotices.id, input.cureNoticeId))
      .for('update')
    if (before === undefined) return err('not_found')
    if (compareCivil(input.receivedOn, before.sentOn as CivilDate) < 0) return err('before_sent')
    if (compareCivil(input.receivedOn, today) > 0) return err('future_date')
    await tx
      .update(cureNotices)
      .set({ returnReceiptOn: input.receivedOn })
      .where(eq(cureNotices.id, input.cureNoticeId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.cure_receipt_recorded',
        entityType: 'cure_notice',
        entityId: input.cureNoticeId,
        before: { returnReceiptOn: before.returnReceiptOn },
        after: { returnReceiptOn: input.receivedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function cureStatus(
  db: Db,
  caseId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<{ rule: CureNoticeRule | null; due: CivilDate | null; lapsedUncorrected: boolean }> {
  signal.throwIfAborted()
  const [caseRow] = await db.select().from(enforcementCases).where(eq(enforcementCases.id, caseId))
  const rule = cureRuleByKey(caseRow?.cureRuleKey ?? null)
  if (rule === null) return { rule: null, due: null, lapsedUncorrected: false }
  const [notices, findings] = await Promise.all([
    db
      .select()
      .from(cureNotices)
      .where(eq(cureNotices.caseId, caseId))
      .orderBy(asc(cureNotices.sentOn)),
    db.select().from(violationFindings).where(eq(violationFindings.caseId, caseId)),
  ])
  const facts = casePlanCure(rule.key, notices)?.notices ?? []
  return { rule, ...cureStanding(findings, facts, today) }
}
