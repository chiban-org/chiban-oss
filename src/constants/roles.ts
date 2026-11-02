export const ROLES = [
  'admin',
  'staff',
  'inspector',
  'finance',
  'records_custodian',
  'reviewer',
  'board_member',
  'applicant',
  'contractor',
] as const

export type Role = (typeof ROLES)[number]

export const STAFF_ROLES: readonly Role[] = [
  'admin',
  'staff',
  'inspector',
  'finance',
  'records_custodian',
  'reviewer',
  'board_member',
]
