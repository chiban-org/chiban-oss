import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { contractorClaims, parcels, projects } from '@/db/schema'
import { hashClaimToken } from '@/features/contractors/claims'

export interface ClaimPreview {
  title: string
  siteAddress: string | null
  email: string
}

export async function peekClaim(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<ClaimPreview | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      email: contractorClaims.email,
      claimedAt: contractorClaims.claimedAt,
      revokedAt: contractorClaims.revokedAt,
      expiresAt: contractorClaims.expiresAt,
      title: projects.title,
      siteAddress: parcels.siteAddress,
    })
    .from(contractorClaims)
    .innerJoin(projects, eq(projects.id, contractorClaims.projectId))
    .leftJoin(parcels, eq(parcels.id, projects.parcelId))
    .where(eq(contractorClaims.tokenHash, hashClaimToken(token)))
  const usable =
    row !== undefined &&
    row.claimedAt === null &&
    row.revokedAt === null &&
    row.expiresAt.getTime() > now.getTime()
  return usable ? { title: row.title, siteAddress: row.siteAddress, email: row.email } : null
}
