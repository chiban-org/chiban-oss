import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import {
  documents,
  enforcementAppeals,
  enforcementOrders,
  PERIL_CATEGORIES,
  perilCertifications,
  restrainingOrders,
  violationNotices,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { stayRuleActive } from '@/features/enforcement/stay'
import { civilDateSchema } from '@/features/packs/schema'
import { err, ok, type Result } from '@/types/result'

export async function targetIssuer(
  tx: DbOrTx,
  caseId: string,
  kind: 'order' | 'notice',
  id: string,
): Promise<string | null | undefined> {
  if (kind === 'order') {
    const [row] = await tx
      .select({ issuedBy: enforcementOrders.issuedBy, status: enforcementOrders.status })
      .from(enforcementOrders)
      .where(and(eq(enforcementOrders.id, id), eq(enforcementOrders.caseId, caseId)))
    return row === undefined || row.status === 'draft' ? undefined : row.issuedBy
  }
  const [row] = await tx
    .select({ sentBy: violationNotices.sentBy })
    .from(violationNotices)
    .where(and(eq(violationNotices.id, id), eq(violationNotices.caseId, caseId)))
  return row?.sentBy
}

const PerilSchema = z.object({
  appealId: z.string().uuid(),
  categories: z.array(z.enum(PERIL_CATEGORIES)).min(1),
  statement: z.string().trim().min(1).max(3000),
  certifiedOn: civilDateSchema,
})

export async function certifyImminentPeril(
  db: Db,
  actor: Actor,
  input: z.input<typeof PerilSchema>,
  signal: AbortSignal,
): Promise<
  Result<
    void,
    | 'forbidden'
    | 'invalid'
    | 'not_found'
    | 'not_issuing_officer'
    | 'appeal_resolved'
    | 'already_certified'
    | 'stay_not_applicable'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.issue_order', signal)
  if (!allowed.ok) return err('forbidden')
  if (!stayRuleActive()) return err('stay_not_applicable')
  const parsed = PerilSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [appeal] = await tx
      .select()
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.id, value.appealId))
      .for('update')
    if (appeal === undefined) return err('not_found')
    if (appeal.resolvedOn !== null) return err('appeal_resolved')
    const issuer = await targetIssuer(tx, appeal.caseId, appeal.targetKind, appeal.targetId)
    if (issuer !== actor.userId) return err('not_issuing_officer')
    const [held] = await tx
      .select({ id: perilCertifications.id })
      .from(perilCertifications)
      .where(eq(perilCertifications.appealId, value.appealId))
    if (held !== undefined) return err('already_certified')
    await tx.insert(perilCertifications).values({
      appealId: value.appealId,
      certifiedOn: value.certifiedOn,
      certifiedBy: actor.userId,
      categories: value.categories,
      statement: value.statement,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.peril_certified',
        entityType: 'enforcement_case',
        entityId: appeal.caseId,
        after: { appealId: value.appealId, categories: value.categories },
      },
      signal,
    )
    return ok(undefined)
  })
}

const RestrainSchema = z.object({
  appealId: z.string().uuid(),
  issuedBy: z.enum(['zba', 'superior_court']),
  issuedOn: civilDateSchema,
  documentId: z.string().uuid(),
})

export async function recordRestrainingOrder(
  db: Db,
  actor: Actor,
  input: z.input<typeof RestrainSchema>,
  signal: AbortSignal,
): Promise<
  Result<
    { restrainingOrderId: string },
    'forbidden' | 'invalid' | 'not_found' | 'proof_required' | 'stay_not_applicable'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  if (!stayRuleActive()) return err('stay_not_applicable')
  const parsed = RestrainSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [appeal] = await tx
      .select()
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.id, value.appealId))
    if (appeal === undefined) return err('not_found')
    const [doc] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, value.documentId),
          eq(documents.recordKind, 'enforcement_case'),
          eq(documents.recordId, appeal.caseId),
          eq(documents.docKind, 'court_document'),
        ),
      )
    if (doc === undefined) return err('proof_required')
    const [row] = await tx
      .insert(restrainingOrders)
      .values({
        appealId: value.appealId,
        issuedBy: value.issuedBy,
        issuedOn: value.issuedOn,
        documentId: value.documentId,
      })
      .returning({ id: restrainingOrders.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.restraining_order',
        entityType: 'enforcement_case',
        entityId: appeal.caseId,
        after: { appealId: value.appealId, issuedBy: value.issuedBy, issuedOn: value.issuedOn },
      },
      signal,
    )
    return ok({ restrainingOrderId: row?.id ?? '' })
  })
}
