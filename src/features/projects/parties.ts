import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { projectParties } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { isActiveParty } from '@/features/projects/access'
import { err, ok, type Result } from '@/types/result'

export interface AddPartyInput {
  projectId: string
  role: 'owner' | 'agent' | 'contractor' | 'applicant'
  name: string
  email?: string
  userId?: string
  ownerAuthorizationOnFile?: boolean
}

async function mayManageParties(
  db: Db,
  actor: Actor,
  projectId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (await hasCapability(db, actor.userId, 'project.manage_parties', signal)) return true
  return actor.kind === 'public' && (await isActiveParty(db, actor.userId, projectId))
}

export async function addParty(
  db: Db,
  actor: Actor,
  input: AddPartyInput,
  signal: AbortSignal,
): Promise<Result<{ partyId: string }, 'forbidden' | 'agent_needs_owner_authorization'>> {
  signal.throwIfAborted()
  if (!(await mayManageParties(db, actor, input.projectId, signal))) return err('forbidden')
  const authorized = input.ownerAuthorizationOnFile === true
  if (input.role === 'agent' && !authorized) return err('agent_needs_owner_authorization')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(projectParties)
      .values({
        projectId: input.projectId,
        userId: input.userId ?? null,
        email: input.email ?? null,
        name: input.name,
        role: input.role,
        ownerAuthorizationOnFile: authorized,
        addedBy: actor.userId,
      })
      .returning({ id: projectParties.id })
    const partyId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'project.party.add',
        entityType: 'project',
        entityId: input.projectId,
        after: { partyId, role: input.role },
      },
      signal,
    )
    return ok({ partyId })
  })
}

export async function removeParty(
  db: Db,
  actor: Actor,
  partyId: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const [party] = await db.select().from(projectParties).where(eq(projectParties.id, partyId))
  if (party === undefined) return err('not_found')
  if (!(await mayManageParties(db, actor, party.projectId, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx
      .update(projectParties)
      .set({ removedAt: new Date() })
      .where(eq(projectParties.id, partyId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'project.party.remove',
        entityType: 'project',
        entityId: party.projectId,
        after: { partyId },
      },
      signal,
    )
    return ok(undefined)
  })
}
