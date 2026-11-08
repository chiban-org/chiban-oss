import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, projectParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { type ClaimRole, sendContractorClaim } from '@/features/contractors/claims'
import type { MailTransport } from '@/features/mail/transport'
import { err, type Result } from '@/types/result'

export type CounterClaimError =
  | 'forbidden'
  | 'rate_limited'
  | 'send_failed'
  | 'no_party_email'
  | 'already_linked'

async function hasLinkedParty(db: Db, applicationId: string, role: ClaimRole): Promise<boolean> {
  const [linked] = await db
    .select({ id: projectParties.id })
    .from(applications)
    .innerJoin(
      projectParties,
      and(
        eq(projectParties.projectId, applications.projectId),
        eq(projectParties.role, role),
        isNull(projectParties.removedAt),
        isNotNull(projectParties.userId),
      ),
    )
    .where(eq(applications.id, applicationId))
    .limit(1)
  return linked !== undefined
}

export async function sendCounterClaim(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { applicationId: string; role?: ClaimRole },
  signal: AbortSignal,
): Promise<Result<{ claimId: string }, CounterClaimError>> {
  signal.throwIfAborted()
  const role = input.role ?? 'contractor'
  const [row] = await db
    .select({
      projectId: applications.projectId,
      partyId: projectParties.id,
      email: projectParties.email,
      name: projectParties.name,
    })
    .from(applications)
    .innerJoin(
      projectParties,
      and(
        eq(projectParties.projectId, applications.projectId),
        eq(projectParties.role, role),
        isNull(projectParties.removedAt),
        isNull(projectParties.userId),
        isNotNull(projectParties.email),
      ),
    )
    .where(eq(applications.id, input.applicationId))
    .orderBy(desc(projectParties.addedAt))
    .limit(1)
  if (row === undefined || row.email === null) {
    const manages = await hasCapability(db, actor.userId, 'project.manage_parties', signal)
    if (!manages) return err('forbidden')
    return err(
      (await hasLinkedParty(db, input.applicationId, role)) ? 'already_linked' : 'no_party_email',
    )
  }
  return await sendContractorClaim(
    db,
    mail,
    actor,
    {
      projectId: row.projectId,
      email: row.email,
      name: row.name,
      partyId: row.partyId,
      role,
      ...(role === 'applicant' ? { applicationId: input.applicationId } : {}),
    },
    signal,
  )
}
