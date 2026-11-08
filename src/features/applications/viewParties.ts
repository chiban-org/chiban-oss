import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { contractorProfiles, projectParties, users } from '@/db/schema'
import { namedParty } from './applicantName'

export interface ViewParty {
  id: string
  name: string | null
  role: string
  ownerAuthorizationOnFile: boolean
  linked: boolean
  account: { email: string; companyName: string | null } | null
}

export async function loadViewParties(db: Db, projectId: string): Promise<ViewParty[]> {
  const rows = await db
    .select({
      party: projectParties,
      accountName: users.displayName,
      accountEmail: users.email,
      companyName: contractorProfiles.companyName,
    })
    .from(projectParties)
    .leftJoin(users, eq(users.id, projectParties.userId))
    .leftJoin(contractorProfiles, eq(contractorProfiles.userId, projectParties.userId))
    .where(and(eq(projectParties.projectId, projectId), isNull(projectParties.removedAt)))
  return rows.map(({ party, accountName, accountEmail, companyName }) => ({
    id: party.id,
    name: namedParty(party.name) ?? accountName,
    role: party.role,
    ownerAuthorizationOnFile: party.ownerAuthorizationOnFile,
    linked: party.userId !== null,
    account: accountEmail === null ? null : { email: accountEmail, companyName },
  }))
}
