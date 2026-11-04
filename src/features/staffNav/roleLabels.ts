import type { Role } from '@/constants/roles'
import { words } from '@/lib/words'

const STAFF_ROLE_ORDER: readonly Role[] = [
  'admin',
  'records_custodian',
  'staff',
  'finance',
  'inspector',
  'reviewer',
  'board_member',
]

const LABELS: ReadonlyMap<Role, string> = new Map([
  ['admin', 'Administrator'],
  ['records_custodian', 'Records custodian'],
  ['staff', 'Land use staff'],
  ['finance', 'Finance'],
  ['inspector', 'Inspector'],
  ['reviewer', 'Reviewer'],
  ['board_member', 'Board member'],
])

export function primaryRoleLabel(roles: readonly Role[]): string {
  const role = STAFF_ROLE_ORDER.find((r) => roles.includes(r))
  return role === undefined ? 'Staff' : (LABELS.get(role) ?? 'Staff')
}

export function roleLabel(role: Role): string {
  return LABELS.get(role) ?? words(role)
}
