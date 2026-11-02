import type { Role } from '@/constants/roles'
import type { Actor } from '@/features/auth/actor'

export const FULL_RECORD_ROLES = [
  'admin',
  'staff',
  'inspector',
  'finance',
  'records_custodian',
] as const satisfies readonly Role[]

export type PartyRole = 'owner' | 'agent' | 'contractor' | 'applicant'

export function hasFullRecordAccess(actor: Actor): boolean {
  return (
    actor.kind === 'staff' &&
    actor.roles.some((r) => (FULL_RECORD_ROLES as readonly string[]).includes(r))
  )
}

export function isReviewer(actor: Actor): boolean {
  return actor.kind === 'staff' && actor.roles.includes('reviewer')
}
