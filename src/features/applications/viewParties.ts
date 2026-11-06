import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { projectParties, users } from '@/db/schema'
import { namedParty } from './applicantName'

export interface ViewParty {
  id: string
  name: string | null
  role: string
  ownerAuthorizationOnFile: boolean
  linked: boolean
}

export async function loadViewParties(db: Db, projectId: string): Promise<ViewParty[]> {
  const rows = await db
    .select({ party: projectParties, accountName: users.displayName })
    .from(projectParties)
    .leftJoin(users, eq(users.id, projectParties.userId))
    .where(and(eq(projectParties.projectId, projectId), isNull(projectParties.removedAt)))
  return rows.map(({ party, accountName }) => ({
    id: party.id,
    name: namedParty(party.name) ?? accountName,
    role: party.role,
    ownerAuthorizationOnFile: party.ownerAuthorizationOnFile,
    linked: party.userId !== null,
  }))
}
