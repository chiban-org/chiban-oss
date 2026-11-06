import { and, asc, eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { enforcementCases, roleCapabilities, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export type ReassignError = 'forbidden' | 'not_found' | 'not_eligible'

function eligible(db: DbOrTx) {
  return db
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roleCapabilities,
      and(
        eq(roleCapabilities.role, userRoles.role),
        eq(roleCapabilities.capability, 'enforcement.manage'),
      ),
    )
}

export async function assigneeChoices(db: DbOrTx): Promise<{ id: string; name: string }[]> {
  return await eligible(db)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.displayName), asc(users.id))
}

export async function caseAssignee(
  db: DbOrTx,
  caseId: string,
): Promise<{ userId: string; name: string } | null> {
  const [row] = await db
    .select({ userId: users.id, name: users.displayName })
    .from(enforcementCases)
    .innerJoin(users, eq(users.id, enforcementCases.assignedTo))
    .where(eq(enforcementCases.id, caseId))
  return row ?? null
}

async function isEligible(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await eligible(db)
    .where(and(eq(users.id, userId), eq(users.isActive, true)))
    .limit(1)
  return row !== undefined
}

export async function reassignCase(
  db: Db,
  actor: Actor,
  input: { caseId: string; userId: string | null },
  signal: AbortSignal,
): Promise<Result<void, ReassignError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (input.userId !== null && !(await isEligible(db, input.userId))) return err('not_eligible')
  return await transactionResult<void, ReassignError>(db, async (tx) => {
    const [before] = await tx
      .select({ assignedTo: enforcementCases.assignedTo })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, input.caseId))
      .for('update')
    if (before === undefined) return err('not_found')
    await tx
      .update(enforcementCases)
      .set({ assignedTo: input.userId, updatedAt: new Date() })
      .where(eq(enforcementCases.id, input.caseId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.case_assigned',
        entityType: 'enforcement_case',
        entityId: input.caseId,
        before: { assignedTo: before.assignedTo },
        after: { assignedTo: input.userId },
      },
      signal,
    )
    return ok(undefined)
  })
}
