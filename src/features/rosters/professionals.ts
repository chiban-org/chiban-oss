import { asc, eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { applicationProfessionals } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters, nonEmpty } from '@/features/rosters/manage'
import { err, ok, type Result } from '@/types/result'

export type ProfessionalRow = typeof applicationProfessionals.$inferSelect
export type Profession = ProfessionalRow['profession']

export async function addProfessional(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    name: string
    profession: Profession
    businessAddress: string
    sealOnPlat: boolean
  },
  signal: AbortSignal,
): Promise<Result<{ professionalId: string }, 'forbidden' | 'address_required' | 'name_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.name)) return err('name_required')
  if (!nonEmpty(input.businessAddress)) return err('address_required')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(applicationProfessionals)
      .values({ ...input, addedBy: actor.userId })
      .returning({ id: applicationProfessionals.id })
    const professionalId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.professional.add',
        entityType: 'application',
        entityId: input.applicationId,
        after: { professionalId, profession: input.profession, sealOnPlat: input.sealOnPlat },
      },
      signal,
    )
    return ok({ professionalId })
  })
}

export async function listProfessionals(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<ProfessionalRow[], 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return ok(await professionalsFor(db, applicationId, signal))
}

export async function professionalsFor(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<ProfessionalRow[]> {
  signal.throwIfAborted()
  return await db
    .select()
    .from(applicationProfessionals)
    .where(eq(applicationProfessionals.applicationId, applicationId))
    .orderBy(asc(applicationProfessionals.name))
}
