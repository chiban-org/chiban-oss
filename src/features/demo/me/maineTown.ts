import { sql } from 'drizzle-orm'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import { townSettings, userRoles, users } from '@/db/schema'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { DEMO_DOMAIN } from '@/features/demo/domain'

export const FERNHOLLOW = {
  name: 'Town of Fernhollow',
  shortName: 'Fernhollow',
  stateCode: 'ME',
  timeZone: 'America/New_York',
  residents: 5200,
  code: 'me.code.mubec',
  addressLines: ['Fernhollow Town Office', '3 Mill Street', 'Fernhollow, ME 04000'],
  mailingAddress: '3 Mill Street, Fernhollow, ME 04000',
} as const

interface MaineUser {
  local: string
  displayName: string
  roles: readonly Role[]
  kind: 'staff' | 'public'
}

const staff = (local: string, displayName: string, roles: readonly Role[]): MaineUser => ({
  local,
  displayName,
  roles,
  kind: 'staff',
})
const resident = (local: string, displayName: string, roles: readonly Role[]): MaineUser => ({
  local,
  displayName,
  roles,
  kind: 'public',
})

export function maineUsers(): readonly MaineUser[] {
  return [
    staff('admin', 'Avery Admin', ['admin']),
    staff('staff', 'Sam Clerk', ['staff']),
    staff('official', 'Dana Booth', ['staff', 'inspector']),
    staff('inspector', 'Ira Inspector', ['inspector']),
    staff('plumbing', 'Lee Piper', ['inspector', 'plumbing_inspector']),
    staff('finance', 'Fern Finance', ['finance']),
    staff('records', 'Rae Records', ['records_custodian']),
    staff('reviewer', 'Remy Reviewer', ['reviewer']),
    staff('board', 'Bea Board', ['board_member']),
    staff('fire', 'Faye Fire', ['reviewer']),
    staff('works', 'Wes Works', ['reviewer']),
    resident('pb.member', 'Robin Vale', ['board_member']),
    resident('zba.member', 'Drew Hale', ['board_member']),
    resident('applicant', 'Alex Applicant', ['applicant']),
    resident('contractor', 'Cory Contractor', ['contractor']),
  ]
}

export async function seedMaineBase(db: Db, signal: AbortSignal) {
  signal.throwIfAborted()
  const people = maineUsers()
  return await db.transaction(async (tx) => {
    const town = await tx
      .insert(townSettings)
      .values({
        id: 1,
        name: FERNHOLLOW.name,
        stateCode: FERNHOLLOW.stateCode,
        timeZone: FERNHOLLOW.timeZone,
      })
      .onConflictDoUpdate({
        target: townSettings.id,
        set: {
          name: FERNHOLLOW.name,
          stateCode: FERNHOLLOW.stateCode,
          timeZone: FERNHOLLOW.timeZone,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: townSettings.id })
    await seedDefaultGrants(tx, signal)
    const created = await tx
      .insert(users)
      .values(
        people.map((u) => ({
          email: `${u.local}@${DEMO_DOMAIN}`,
          displayName: u.displayName,
          kind: u.kind,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email })
    const idByEmail = new Map(created.map((u) => [u.email, u.id]))
    const roleRows = people.flatMap((u) => {
      const userId = idByEmail.get(`${u.local}@${DEMO_DOMAIN}`)
      return userId === undefined ? [] : u.roles.map((role) => ({ userId, role }))
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
