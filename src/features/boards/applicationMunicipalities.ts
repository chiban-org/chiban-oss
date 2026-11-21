import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applicationMunicipalities } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { lockApplication } from '@/features/applications/lockApplication'
import { TERMINAL_STATES } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import { mayManageAbutters } from '@/features/rosters/manage'
import { err, ok, type Result } from '@/types/result'

export type MunicipalityRelation = 'abutting' | 'includes'

export type ApplicationMunicipalitiesError =
  | 'forbidden'
  | 'not_found'
  | 'application_closed'
  | 'unknown_municipality'

export async function setApplicationMunicipalities(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    municipalities: { key: string; relation: MunicipalityRelation }[]
  },
  signal: AbortSignal,
): Promise<Result<void, ApplicationMunicipalitiesError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const byKey = new Map(input.municipalities.map((m) => [m.key.trim(), m.relation]))
  byKey.delete('')
  return await transactionResult<void, ApplicationMunicipalitiesError>(db, async (tx) => {
    const state = await lockApplication(tx, input.applicationId)
    if (state === null) return err('not_found')
    if (TERMINAL_STATES.includes(state)) return err('application_closed')
    const known = new Set((await getRegionalContacts(tx, signal)).municipalities.map((m) => m.key))
    if ([...byKey.keys()].some((key) => !known.has(key))) return err('unknown_municipality')
    await tx
      .delete(applicationMunicipalities)
      .where(eq(applicationMunicipalities.applicationId, input.applicationId))
    if (byKey.size > 0) {
      await tx.insert(applicationMunicipalities).values(
        [...byKey].map(([municipalityKey, relation]) => ({
          applicationId: input.applicationId,
          municipalityKey,
          relation,
        })),
      )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.application_municipalities.set',
        entityType: 'application',
        entityId: input.applicationId,
        after: { municipalities: [...byKey].map(([key, relation]) => ({ key, relation })) },
      },
      signal,
    )
    return ok(undefined)
  })
}
