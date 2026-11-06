import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { applications, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { FULL_RECORD_ROLES } from '@/features/access/roles'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export interface StaffChoice {
  id: string
  name: string
}

export type ResponsibleStaffError = 'forbidden' | 'not_found' | 'not_staff'

const STAFF_SIDE = and(eq(users.isActive, true), inArray(userRoles.role, [...FULL_RECORD_ROLES]))

export async function listResponsibleChoices(db: DbOrTx): Promise<StaffChoice[]> {
  return await db
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(STAFF_SIDE)
    .orderBy(asc(users.displayName), asc(users.id))
}

async function isStaffSide(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.id, userId), STAFF_SIDE))
    .limit(1)
  return row !== undefined
}

export async function responsibleStaffOf(
  db: DbOrTx,
  applicationId: string,
): Promise<{ userId: string; name: string } | null> {
  const [row] = await db
    .select({ userId: users.id, name: users.displayName })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.responsibleUserId))
    .where(eq(applications.id, applicationId))
  return row ?? null
}

export async function setResponsibleStaff(
  db: Db,
  actor: Actor,
  input: { applicationId: string; userId: string | null },
  signal: AbortSignal,
): Promise<Result<void, ResponsibleStaffError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'application.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (input.userId !== null && !(await isStaffSide(db, input.userId))) return err('not_staff')
  return await transactionResult<void, ResponsibleStaffError>(db, async (tx) => {
    const [before] = await tx
      .select({ responsibleUserId: applications.responsibleUserId })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    if (before === undefined) return err('not_found')
    await tx
      .update(applications)
      .set({ responsibleUserId: input.userId, updatedAt: new Date() })
      .where(eq(applications.id, input.applicationId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'application.responsible_staff',
        entityType: 'application',
        entityId: input.applicationId,
        before: { responsibleUserId: before.responsibleUserId },
        after: { responsibleUserId: input.userId },
      },
      signal,
    )
    return ok(undefined)
  })
}
