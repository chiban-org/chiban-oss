import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, projectParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { sendContractorClaim } from '@/features/contractors/claims'
import type { MailTransport } from '@/features/mail/transport'
import { err, type Result } from '@/types/result'

export async function sendCounterClaim(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { applicationId: string },
  signal: AbortSignal,
): Promise<
  Result<{ claimId: string }, 'forbidden' | 'rate_limited' | 'send_failed' | 'no_contractor_email'>
> {
  signal.throwIfAborted()
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
        eq(projectParties.role, 'contractor'),
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
    return err(manages ? 'no_contractor_email' : 'forbidden')
  }
  return await sendContractorClaim(
    db,
    mail,
    actor,
    { projectId: row.projectId, email: row.email, name: row.name, partyId: row.partyId },
    signal,
  )
}
