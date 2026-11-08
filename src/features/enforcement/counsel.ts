import { civilDateSchema } from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import {
  COUNSEL_OUTCOME_KINDS,
  COUNSEL_PURPOSES,
  counselOutcomes,
  counselReferrals,
  documents,
  enforcementCases,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import { buildCounselPacket } from '@/features/enforcement/counselPacket'
import { storeGeneratedBytes } from '@/features/files/ingest'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const ReferSchema = z.object({
  caseId: z.string().uuid(),
  counselName: z.string().trim().min(1).max(200),
  purpose: z.enum(COUNSEL_PURPOSES),
  referredOn: civilDateSchema,
})

export async function referToCounsel(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: z.input<typeof ReferSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<{ referralId: string; packetDocumentId: string }, 'forbidden' | 'invalid' | 'not_found'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.refer_counsel', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ReferSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [caseRow] = await tx
      .select({ number: enforcementCases.number })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, value.caseId))
    if (caseRow === undefined) return err('not_found')
    const bytes = await buildCounselPacket(tx, value.caseId, value.referredOn, now, signal)
    const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'enforcement_case', id: value.caseId },
        title: `Counsel packet for ${caseRow.number}`,
        docKind: 'enforcement_letter',
        file: {
          sha256: stored.sha256,
          filename: `${caseRow.number}-counsel-packet.pdf`,
          contentType: 'application/pdf',
        },
      },
      signal,
    )
    const [row] = await tx
      .insert(counselReferrals)
      .values({
        caseId: value.caseId,
        referredOn: value.referredOn,
        counselName: value.counselName,
        purpose: value.purpose,
        packetDocumentId: attached.documentId,
        referredBy: actor.userId,
      })
      .returning({ id: counselReferrals.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.counsel_referred',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { referralId: row?.id, purpose: value.purpose },
      },
      signal,
    )
    return ok({ referralId: row?.id ?? '', packetDocumentId: attached.documentId })
  })
}

const OutcomeSchema = z.object({
  referralId: z.string().uuid(),
  kind: z.enum(COUNSEL_OUTCOME_KINDS),
  occurredOn: civilDateSchema,
  court: z.string().trim().min(1).max(200).optional(),
  docket: z.string().trim().min(1).max(100).optional(),
  documentId: z.string().uuid().optional(),
  note: z.string().trim().min(1).max(2000).optional(),
})

export async function recordCounselOutcome(
  db: Db,
  actor: Actor,
  input: z.input<typeof OutcomeSchema>,
  signal: AbortSignal,
): Promise<
  Result<{ outcomeId: string }, 'forbidden' | 'invalid' | 'not_found' | 'document_invalid'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.refer_counsel', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = OutcomeSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [referral] = await tx
      .select()
      .from(counselReferrals)
      .where(eq(counselReferrals.id, value.referralId))
    if (referral === undefined) return err('not_found')
    await tx
      .select({ id: enforcementCases.id })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, referral.caseId))
      .for('update')
    if (value.documentId !== undefined) {
      const [doc] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, value.documentId),
            eq(documents.recordKind, 'enforcement_case'),
            eq(documents.recordId, referral.caseId),
          ),
        )
      if (doc === undefined) return err('document_invalid')
    }
    const [row] = await tx
      .insert(counselOutcomes)
      .values({
        referralId: value.referralId,
        kind: value.kind,
        occurredOn: value.occurredOn,
        court: value.court ?? null,
        docket: value.docket ?? null,
        documentId: value.documentId ?? null,
        note: value.note ?? null,
        recordedBy: actor.userId,
      })
      .returning({ id: counselOutcomes.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.counsel_outcome',
        entityType: 'enforcement_case',
        entityId: referral.caseId,
        after: { outcomeId: row?.id, kind: value.kind, occurredOn: value.occurredOn },
      },
      signal,
    )
    return ok({ outcomeId: row?.id ?? '' })
  })
}
