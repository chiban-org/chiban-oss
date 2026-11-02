import { civilDateSchema } from '@packs/nh/schema'
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import { enforcementDesignations } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const DesignationSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  adoptingAuthority: z.string().trim().min(1).max(200),
  adoptedOn: civilDateSchema,
  endedOn: civilDateSchema.optional(),
})

export async function designateEnforcementOfficer(
  db: Db,
  actor: Actor,
  input: z.input<typeof DesignationSchema>,
  signal: AbortSignal,
): Promise<Result<{ designationId: string }, 'forbidden' | 'invalid'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = DesignationSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(enforcementDesignations)
      .values({
        userId: value.userId,
        title: value.title,
        adoptingAuthority: value.adoptingAuthority,
        adoptedOn: value.adoptedOn,
        endedOn: value.endedOn ?? null,
      })
      .returning({ id: enforcementDesignations.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.officer_designated',
        entityType: 'enforcement_designation',
        entityId: row?.id ?? '',
        after: { userId: value.userId, adoptedOn: value.adoptedOn, title: value.title },
      },
      signal,
    )
    return ok({ designationId: row?.id ?? '' })
  })
}

export async function designationOn(
  db: DbOrTx,
  userId: string,
  on: CivilDate,
): Promise<typeof enforcementDesignations.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(enforcementDesignations)
    .where(
      and(
        eq(enforcementDesignations.userId, userId),
        lte(enforcementDesignations.adoptedOn, on),
        or(isNull(enforcementDesignations.endedOn), gte(enforcementDesignations.endedOn, on)),
      ),
    )
    .limit(1)
  return row ?? null
}
