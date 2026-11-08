import { civilDateSchema } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { enforcementCases, NOTICE_METHODS, violationFindings, violationNotices } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import { renderNoticePdf } from '@/features/enforcement/orderPdf'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const SendSchema = z.object({
  caseId: z.string().uuid(),
  findingIds: z.array(z.string().uuid()).min(1),
  sentOn: civilDateSchema,
  method: z.enum(NOTICE_METHODS),
})

export async function sendViolationNotice(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: z.input<typeof SendSchema>,
  signal: AbortSignal,
  _now: Date = new Date(),
): Promise<
  Result<
    { noticeId: string; documentId: string },
    'forbidden' | 'invalid' | 'not_found' | 'findings_invalid'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = SendSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [caseRow] = await tx
      .select()
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
    const bytes = await renderNoticePdf({
      frame: await documentFrame(tx, {}, signal, store),
      caseNumber: caseRow.number,
      locationText: caseRow.locationText,
      findings,
      sentOn: value.sentOn,
    })
    const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'enforcement_case', id: value.caseId },
        title: `Notice of violation for ${caseRow.number}`,
        docKind: 'enforcement_letter',
        file: {
          sha256: stored.sha256,
          filename: `${caseRow.number}-notice-of-violation.pdf`,
          contentType: 'application/pdf',
        },
      },
      signal,
    )
    const [notice] = await tx
      .insert(violationNotices)
      .values({
        caseId: value.caseId,
        findingIds: value.findingIds,
        sentOn: value.sentOn,
        method: value.method,
        sentBy: actor.userId,
        documentId: attached.documentId,
      })
      .returning({ id: violationNotices.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.notice_sent',
        entityType: 'violation_notice',
        entityId: notice?.id ?? '',
        after: { caseId: value.caseId, method: value.method, sentOn: value.sentOn },
      },
      signal,
    )
    return ok({ noticeId: notice?.id ?? '', documentId: attached.documentId })
  })
}

const ReceiptSchema = z.object({
  noticeId: z.string().uuid(),
  receivedOn: civilDateSchema,
  basis: z.string().trim().min(1).max(500),
})

export async function recordNoticeReceipt(
  db: Db,
  actor: Actor,
  input: z.input<typeof ReceiptSchema>,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'invalid' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ReceiptSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [before] = await tx
      .select()
      .from(violationNotices)
      .where(eq(violationNotices.id, value.noticeId))
      .for('update')
    if (before === undefined) return err('not_found')
    await tx
      .update(violationNotices)
      .set({ receivedOn: value.receivedOn, receiptBasis: value.basis })
      .where(eq(violationNotices.id, value.noticeId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.notice_received',
        entityType: 'violation_notice',
        entityId: value.noticeId,
        before: { receivedOn: before.receivedOn },
        after: { receivedOn: value.receivedOn, basis: value.basis },
      },
      signal,
    )
    return ok(undefined)
  })
}
