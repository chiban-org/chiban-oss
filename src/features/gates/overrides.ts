import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, gateOverrides } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import '@/features/gates/coreGates'
import '@/features/gates/registerAll'
import { gateByKey } from '@/features/gates/registry'
import { err, ok, type Result } from '@/types/result'

const MIN_REASON_LENGTH = 10

export interface LegalAuthority {
  citation: string
  explanation: string
}

export async function overrideAdministrativeGate(
  db: Db,
  actor: Actor,
  input: { applicationId: string; gateKey: string; reason: string },
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'reason_required' | 'statutory_requires_authority' | 'unknown_gate'>
> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'gate.override_admin', signal)))
    return err('forbidden')
  const gate = gateByKey(input.gateKey)
  if (gate === undefined) return err('unknown_gate')
  if (gate.kind === 'statutory') return err('statutory_requires_authority')
  const reason = input.reason.trim()
  if (reason.length < MIN_REASON_LENGTH) return err('reason_required')
  return await transactionResult(db, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
    if (app === undefined) return err('unknown_gate')
    const [row] = await tx
      .insert(gateOverrides)
      .values({
        applicationId: input.applicationId,
        gateKey: input.gateKey,
        kind: 'administrative_override',
        reason,
        createdBy: actor.userId,
      })
      .returning({ id: gateOverrides.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'gate.override',
        entityType: 'application',
        entityId: input.applicationId,
        after: { overrideId: row?.id, gateKey: input.gateKey, reason },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function recordStatutoryException(
  db: Db,
  actor: Actor,
  input: { applicationId: string; gateKey: string; legalAuthority: LegalAuthority },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'authority_required' | 'not_statutory'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'gate.record_statutory_exception', signal))) {
    return err('forbidden')
  }
  const gate = gateByKey(input.gateKey)
  if (gate?.kind !== 'statutory') return err('not_statutory')
  const citation = input.legalAuthority.citation.trim()
  const explanation = input.legalAuthority.explanation.trim()
  if (citation === '' || explanation === '') return err('authority_required')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(gateOverrides)
      .values({
        applicationId: input.applicationId,
        gateKey: input.gateKey,
        kind: 'statutory_exception',
        legalAuthority: { citation, explanation },
        createdBy: actor.userId,
      })
      .returning({ id: gateOverrides.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'gate.statutory_exception',
        entityType: 'application',
        entityId: input.applicationId,
        after: { overrideId: row?.id, gateKey: input.gateKey, citation, explanation },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function revokeGateOverride(
  db: Db,
  actor: Actor,
  overrideId: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const [row] = await db.select().from(gateOverrides).where(eq(gateOverrides.id, overrideId))
  if (row === undefined) return err('not_found')
  const capability =
    row.kind === 'statutory_exception' ? 'gate.record_statutory_exception' : 'gate.override_admin'
  if (!(await hasCapability(db, actor.userId, capability, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const updated = await tx
      .update(gateOverrides)
      .set({ revokedAt: new Date(), revokedBy: actor.userId })
      .where(and(eq(gateOverrides.id, overrideId), isNull(gateOverrides.revokedAt)))
      .returning({ id: gateOverrides.id })
    if (updated.length === 0) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'gate.override_revoke',
        entityType: 'application',
        entityId: row.applicationId,
        after: { overrideId, gateKey: row.gateKey },
      },
      signal,
    )
    return ok(undefined)
  })
}
