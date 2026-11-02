import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { complaints, enforcementCases } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const TextSchema = z.object({
  complaintId: z.string().uuid(),
  text: z.string().trim().max(5000),
})

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export async function setComplaintPublicText(
  db: Db,
  actor: Actor,
  input: z.input<typeof TextSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, 'forbidden' | 'empty' | 'invalid' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = TextSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (value.text === '') return err('empty')
  return await transactionResult(db, async (tx) => {
    const updated = await tx
      .update(complaints)
      .set({
        descriptionPublic: value.text,
        publicTextApprovedBy: actor.userId,
        publicTextApprovedAt: now,
      })
      .where(eq(complaints.id, value.complaintId))
      .returning({ id: complaints.id })
    if (updated.length === 0) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.public_text_set',
        entityType: 'complaint',
        entityId: value.complaintId,
        after: { textSha256: sha256(value.text) },
      },
      signal,
    )
    return ok(undefined)
  })
}

const PublishSchema = z.object({
  caseId: z.string().uuid(),
  summary: z.string().trim().max(1000),
})

export async function publishCase(
  db: Db,
  actor: Actor,
  input: z.input<typeof PublishSchema>,
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'empty' | 'invalid' | 'not_found' | 'complaint_text_unreviewed'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = PublishSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (value.summary === '') return err('empty')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .select({ id: enforcementCases.id })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, value.caseId))
      .for('update')
    if (row === undefined) return err('not_found')
    const unreviewed = await tx
      .select({ id: complaints.id })
      .from(complaints)
      .where(and(eq(complaints.caseId, value.caseId), isNull(complaints.descriptionPublic)))
      .limit(1)
    if (unreviewed.length > 0) return err('complaint_text_unreviewed')
    await tx
      .update(enforcementCases)
      .set({ isPublic: true, publicSummary: value.summary, updatedAt: new Date() })
      .where(eq(enforcementCases.id, value.caseId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.case_published',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { summarySha256: sha256(value.summary) },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function unpublishCase(
  db: Db,
  actor: Actor,
  input: { caseId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const updated = await tx
      .update(enforcementCases)
      .set({ isPublic: false, updatedAt: new Date() })
      .where(eq(enforcementCases.id, input.caseId))
      .returning({ id: enforcementCases.id })
    if (updated.length === 0) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.case_unpublished',
        entityType: 'enforcement_case',
        entityId: input.caseId,
      },
      signal,
    )
    return ok(undefined)
  })
}
