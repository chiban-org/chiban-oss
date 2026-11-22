import { sql } from 'drizzle-orm'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import { townSettings, userRoles, users } from '@/db/schema'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { appealsMemberLocal, DEMO_DOMAIN } from '@/features/demo/domain'

const DEMO_TIME_ZONE = 'America/New_York'

export interface DemoUser {
  email: string
  displayName: string
  roles: readonly Role[]
  kind: 'staff' | 'public'
}

function usersWithAppealsLocal(appealsLocal: string): readonly DemoUser[] {
  return [
    { email: `admin@${DEMO_DOMAIN}`, displayName: 'Avery Admin', roles: ['admin'], kind: 'staff' },
    { email: `staff@${DEMO_DOMAIN}`, displayName: 'Sam Clerk', roles: ['staff'], kind: 'staff' },
    {
      email: `official@${DEMO_DOMAIN}`,
      displayName: 'Dana Booth',
      roles: ['staff', 'inspector'],
      kind: 'staff',
    },
    {
      email: `inspector@${DEMO_DOMAIN}`,
      displayName: 'Ira Inspector',
      roles: ['inspector'],
      kind: 'staff',
    },
    {
      email: `finance@${DEMO_DOMAIN}`,
      displayName: 'Fern Finance',
      roles: ['finance'],
      kind: 'staff',
    },
    {
      email: `records@${DEMO_DOMAIN}`,
      displayName: 'Rae Records',
      roles: ['records_custodian'],
      kind: 'staff',
    },
    {
      email: `reviewer@${DEMO_DOMAIN}`,
      displayName: 'Remy Reviewer',
      roles: ['reviewer'],
      kind: 'staff',
    },
    {
      email: `board@${DEMO_DOMAIN}`,
      displayName: 'Bea Board',
      roles: ['board_member'],
      kind: 'staff',
    },
    { email: `fire@${DEMO_DOMAIN}`, displayName: 'Faye Fire', roles: ['reviewer'], kind: 'staff' },
    { email: `works@${DEMO_DOMAIN}`, displayName: 'Wes Works', roles: ['reviewer'], kind: 'staff' },
    {
      email: `pb.member@${DEMO_DOMAIN}`,
      displayName: 'Robin Vale',
      roles: ['board_member'],
      kind: 'public',
    },
    {
      email: `${appealsLocal}@${DEMO_DOMAIN}`,
      displayName: 'Drew Hale',
      roles: ['board_member'],
      kind: 'public',
    },
    {
      email: `concom.member@${DEMO_DOMAIN}`,
      displayName: 'Cleo Marsh',
      roles: ['board_member'],
      kind: 'public',
    },
    {
      email: `applicant@${DEMO_DOMAIN}`,
      displayName: 'Alex Applicant',
      roles: ['applicant'],
      kind: 'public',
    },
    {
      email: `contractor@${DEMO_DOMAIN}`,
      displayName: 'Cory Contractor',
      roles: ['contractor'],
      kind: 'public',
    },
  ]
}

export function demoUsers(): readonly DemoUser[] {
  return usersWithAppealsLocal(appealsMemberLocal())
}

export const DEMO_USERS: readonly DemoUser[] = usersWithAppealsLocal('zba.member')

export interface DemoTown {
  name: string
  stateCode: string
  users: readonly DemoUser[]
}

export async function seedTownAndUsers(db: Db, town: DemoTown, signal: AbortSignal) {
  return await db.transaction(async (tx) => {
    const settings = await tx
      .insert(townSettings)
      .values({ id: 1, name: town.name, stateCode: town.stateCode, timeZone: DEMO_TIME_ZONE })
      .onConflictDoUpdate({
        target: townSettings.id,
        set: {
          name: town.name,
          stateCode: town.stateCode,
          timeZone: DEMO_TIME_ZONE,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: townSettings.id })

    await seedDefaultGrants(tx, signal)

    const created = await tx
      .insert(users)
      .values(town.users.map((u) => ({ email: u.email, displayName: u.displayName, kind: u.kind })))
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email })

    const idByEmail = new Map(created.map((u) => [u.email, u.id]))
    const roleRows = town.users.flatMap((u) => {
      const userId = idByEmail.get(u.email)
      return userId === undefined ? [] : u.roles.map((role) => ({ userId, role }))
    })
    const assigned =
      roleRows.length === 0
        ? []
        : await tx.insert(userRoles).values(roleRows).onConflictDoNothing().returning()

    return {
      townConfigured: settings.length === 1,
      usersCreated: created.length,
      rolesAssigned: assigned.length,
    }
  })
}
