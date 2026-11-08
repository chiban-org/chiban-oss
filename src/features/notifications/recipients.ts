import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications, cutoverRows, projectParties } from '@/db/schema'

export type RecipientRole = 'applicant' | 'owner' | 'agent' | 'contractor'

const CLAIMABLE_ROLES: readonly RecipientRole[] = ['applicant', 'contractor']

export interface Recipients {
  userIds: string[]
  partyIds: string[]
}

interface PartyRow {
  partyId: string
  userId: string | null
  email: string | null
  role: RecipientRole
  imported: boolean
}

function addressable(row: PartyRow): boolean {
  return (
    row.userId === null && row.email !== null && !row.imported && CLAIMABLE_ROLES.includes(row.role)
  )
}

export async function resolveRecipients(
  tx: Tx,
  applicationId: string,
  roles: readonly RecipientRole[],
): Promise<Recipients> {
  const rows: PartyRow[] = await tx
    .select({
      partyId: projectParties.id,
      userId: projectParties.userId,
      email: projectParties.email,
      role: projectParties.role,
      imported: sql<boolean>`exists (select 1 from ${cutoverRows} where ${cutoverRows.applicationId} = ${applications.id})`,
    })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, applicationId),
        isNull(projectParties.removedAt),
        inArray(projectParties.role, [...roles]),
      ),
    )
    .for('share', { of: projectParties })
  return {
    userIds: [...new Set(rows.flatMap((r) => (r.userId === null ? [] : [r.userId])))],
    partyIds: rows.filter(addressable).map((r) => r.partyId),
  }
}
