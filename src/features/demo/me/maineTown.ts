import type { Db } from '@/db/client'
import { DEMO_USERS, type DemoUser, seedTownAndUsers } from '@/features/demo/demoUsers'
import { DEMO_DOMAIN } from '@/features/demo/domain'

export const FERNHOLLOW = {
  name: 'Town of Fernhollow',
  stateCode: 'ME',
  residents: 5200,
  code: 'me.code.mubec',
  addressLines: ['Fernhollow Town Office', '3 Mill Street', 'Fernhollow, ME 04000'],
} as const

export const PLUMBING_INSPECTOR: DemoUser = {
  email: `plumbing@${DEMO_DOMAIN}`,
  displayName: 'Lee Piper',
  roles: ['inspector', 'plumbing_inspector'],
  kind: 'staff',
}

export function maineUsers(): readonly DemoUser[] {
  return [...DEMO_USERS, PLUMBING_INSPECTOR]
}

export async function seedMaineBase(db: Db, signal: AbortSignal) {
  signal.throwIfAborted()
  return await seedTownAndUsers(
    db,
    { name: FERNHOLLOW.name, stateCode: FERNHOLLOW.stateCode, users: maineUsers() },
    signal,
  )
}
