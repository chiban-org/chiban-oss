import { sql } from 'drizzle-orm'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import { townSettings, userRoles, users } from '@/db/schema'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'

export const DEMO_DOMAIN = 'alderpond.example'

export interface DemoUser {
  email: string
  displayName: string
  role: Role
  kind: 'staff' | 'public'
}

export const DEMO_USERS: readonly DemoUser[] = [
  { email: `admin@${DEMO_DOMAIN}`, displayName: 'Avery Admin', role: 'admin', kind: 'staff' },
  { email: `staff@${DEMO_DOMAIN}`, displayName: 'Sam Clerk', role: 'staff', kind: 'staff' },
  {
    email: `inspector@${DEMO_DOMAIN}`,
    displayName: 'Ira Inspector',
    role: 'inspector',
    kind: 'staff',
  },
  { email: `finance@${DEMO_DOMAIN}`, displayName: 'Fern Finance', role: 'finance', kind: 'staff' },
  {
    email: `records@${DEMO_DOMAIN}`,
    displayName: 'Rae Records',
    role: 'records_custodian',
    kind: 'staff',
  },
  {
    email: `reviewer@${DEMO_DOMAIN}`,
    displayName: 'Remy Reviewer',
    role: 'reviewer',
    kind: 'staff',
  },
  { email: `board@${DEMO_DOMAIN}`, displayName: 'Bea Board', role: 'board_member', kind: 'staff' },
  {
    email: `applicant@${DEMO_DOMAIN}`,
    displayName: 'Alex Applicant',
    role: 'applicant',
    kind: 'public',
  },
  {
    email: `contractor@${DEMO_DOMAIN}`,
    displayName: 'Cory Contractor',
    role: 'contractor',
    kind: 'public',
  },
]

export interface SeedReport {
  townConfigured: boolean
  usersCreated: number
  rolesAssigned: number
}

export async function seedDemo(db: Db, signal: AbortSignal): Promise<SeedReport> {
  signal.throwIfAborted()
  return await db.transaction(async (tx) => {
    const town = await tx
      .insert(townSettings)
      .values({ id: 1, name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' })
      .onConflictDoUpdate({
        target: townSettings.id,
        set: {
          name: 'Town of Alder Pond',
          stateCode: 'NH',
          timeZone: 'America/New_York',
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: townSettings.id })

    await seedDefaultGrants(tx, signal)

    const created = await tx
      .insert(users)
      .values(DEMO_USERS.map((u) => ({ email: u.email, displayName: u.displayName, kind: u.kind })))
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email })

    const idByEmail = new Map(created.map((u) => [u.email, u.id]))
    const roleRows = DEMO_USERS.flatMap((u) => {
      const userId = idByEmail.get(u.email)
      return userId === undefined ? [] : [{ userId, role: u.role }]
    })
    const assigned =
      roleRows.length === 0
        ? []
        : await tx.insert(userRoles).values(roleRows).onConflictDoNothing().returning()

    return {
      townConfigured: town.length === 1,
      usersCreated: created.length,
      rolesAssigned: assigned.length,
    }
  })
}
