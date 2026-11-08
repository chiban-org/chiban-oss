import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, contractorClaims } from '@/db/schema'
import { CLAIM_DAYS, claimLink, newClaimToken } from '@/features/contractors/claims'

export interface SystemClaimLink {
  claimId: string
  link: string
  days: number
}

export async function mintSystemClaim(
  db: DbOrTx,
  party: { id: string; email: string },
  input: { applicationId: string; now: Date },
): Promise<SystemClaimLink | null> {
  const [app] = await db
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  if (app === undefined) return null
  const { token, tokenHash, expiresAt } = newClaimToken(input.now)
  const [row] = await db
    .insert(contractorClaims)
    .values({
      projectId: app.projectId,
      partyId: party.id,
      applicationId: input.applicationId,
      email: party.email.trim().toLowerCase(),
      tokenHash,
      sentBy: null,
      sentByKind: 'system',
      expiresAt,
      createdAt: input.now,
    })
    .returning({ id: contractorClaims.id })
  if (row === undefined) return null
  return { claimId: row.id, link: claimLink(token), days: CLAIM_DAYS }
}

export async function revokeSystemClaim(db: DbOrTx, claimId: string, now: Date): Promise<void> {
  await db
    .update(contractorClaims)
    .set({ revokedAt: now })
    .where(and(eq(contractorClaims.id, claimId), isNull(contractorClaims.claimedAt)))
}
