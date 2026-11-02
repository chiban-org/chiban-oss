import { civilDateSchema } from '@packs/nh/schema'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import {
  documents,
  ENFORCEMENT_APPEAL_OUTCOMES,
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
import { lockCase } from '@/features/enforcement/cases'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

const AppealSchema = z.object({
  caseId: z.string().uuid(),
  targetKind: z.enum(['order', 'notice']),
  targetId: z.string().uuid(),
  filedOn: civilDateSchema,
  appellantName: z.string().trim().min(1).max(200),
})

async function targetIssuer(
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

export async function recordEnforcementAppeal(
  db: Db,
  actor: Actor,
  input: z.input<typeof AppealSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<{ appealId: string }, 'forbidden' | 'invalid' | 'target_not_found' | 'date_in_future'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = AppealSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    if (value.filedOn > (await townToday(tx, now, signal))) return err('date_in_future')
    const issuer = await targetIssuer(tx, value.caseId, value.targetKind, value.targetId)
    if (issuer === undefined) return err('target_not_found')
    const [row] = await tx
      .insert(enforcementAppeals)
      .values({
        caseId: value.caseId,
        targetKind: value.targetKind,
        targetId: value.targetId,
        filedOn: value.filedOn,
        appellantName: value.appellantName,
        recordedBy: actor.userId,
      })
      .returning({ id: enforcementAppeals.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.appeal_filed',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { appealId: row?.id, targetKind: value.targetKind, filedOn: value.filedOn },
      },
      signal,
    )
    return ok({ appealId: row?.id ?? '' })
  })
}

const ResolveSchema = z.object({
  appealId: z.string().uuid(),
  resolvedOn: civilDateSchema,
  outcome: z.enum(ENFORCEMENT_APPEAL_OUTCOMES),
})

export async function resolveEnforcementAppeal(
  db: Db,
  actor: Actor,
  input: z.input<typeof ResolveSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<void, 'forbidden' | 'invalid' | 'not_found' | 'already_resolved' | 'date_in_future'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ResolveSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    if (value.resolvedOn > (await townToday(tx, now, signal))) return err('date_in_future')
    const [target] = await tx
      .select({ caseId: enforcementAppeals.caseId })
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.id, value.appealId))
    if (target === undefined) return err('not_found')
    await lockCase(tx, target.caseId)
    const [appeal] = await tx
      .select()
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.id, value.appealId))
      .for('update')
    if (appeal === undefined) return err('not_found')
    if (appeal.resolvedOn !== null) return err('already_resolved')
    if (value.resolvedOn < appeal.filedOn) return err('invalid')
    await tx
      .update(enforcementAppeals)
      .set({ resolvedOn: value.resolvedOn, outcome: value.outcome })
      .where(eq(enforcementAppeals.id, value.appealId))
    if (value.outcome === 'annulled' && appeal.targetKind === 'order') {
      await tx
        .update(enforcementOrders)
        .set({ status: 'annulled', rowVersion: sql`${enforcementOrders.rowVersion} + 1` })
        .where(eq(enforcementOrders.id, appeal.targetId))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.appeal_resolved',
        entityType: 'enforcement_case',
        entityId: appeal.caseId,
        after: { appealId: value.appealId, outcome: value.outcome, resolvedOn: value.resolvedOn },
      },
      signal,
    )
    return ok(undefined)
  })
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
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.issue_order', signal)
  if (!allowed.ok) return err('forbidden')
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
  Result<{ restrainingOrderId: string }, 'forbidden' | 'invalid' | 'not_found' | 'proof_required'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
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

export async function dissolveRestrainingOrder(
  db: Db,
  actor: Actor,
  input: { restrainingOrderId: string; dissolvedOn: z.input<typeof civilDateSchema> },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'invalid' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = civilDateSchema.safeParse(input.dissolvedOn)
  if (!parsed.success) return err('invalid')
  return await transactionResult(db, async (tx) => {
    const updated = await tx
      .update(restrainingOrders)
      .set({ dissolvedOn: parsed.data })
      .where(eq(restrainingOrders.id, input.restrainingOrderId))
      .returning({ id: restrainingOrders.id, appealId: restrainingOrders.appealId })
    const row = updated[0]
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.restraining_order_dissolved',
        entityType: 'restraining_order',
        entityId: row.id,
        after: { dissolvedOn: parsed.data },
      },
      signal,
    )
    return ok(undefined)
  })
}
