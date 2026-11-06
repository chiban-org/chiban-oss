import path from 'node:path'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { E2E_AUTH_DIR } from './settings'

export const STAFF_ROLE_KEYS = [
  'admin',
  'staff',
  'inspector',
  'finance',
  'records',
  'reviewer',
  'board',
] as const

export const PUBLIC_ROLE_KEYS = [
  'applicant',
  'contractor',
  'planningBoardMember',
  'zbaMember',
] as const

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number]
export type PublicRoleKey = (typeof PUBLIC_ROLE_KEYS)[number]
export type SignedInRoleKey = StaffRoleKey | PublicRoleKey
export type RoleKey = SignedInRoleKey | 'anonymous'

export interface Account {
  email: string
  displayName: string
  signIn: 'password' | 'magic_link'
}

const demo = (local: string) => `${local}@${DEMO_DOMAIN}`

const ACCOUNTS: Readonly<Record<SignedInRoleKey, Account>> = {
  admin: { email: demo('admin'), displayName: 'Avery Admin', signIn: 'password' },
  staff: { email: demo('staff'), displayName: 'Sam Clerk', signIn: 'password' },
  inspector: { email: demo('inspector'), displayName: 'Ira Inspector', signIn: 'password' },
  finance: { email: demo('finance'), displayName: 'Fern Finance', signIn: 'password' },
  records: { email: demo('records'), displayName: 'Rae Records', signIn: 'password' },
  reviewer: { email: demo('reviewer'), displayName: 'Remy Reviewer', signIn: 'password' },
  board: { email: demo('board'), displayName: 'Bea Board', signIn: 'password' },
  applicant: { email: demo('applicant'), displayName: 'Alex Applicant', signIn: 'magic_link' },
  contractor: { email: demo('contractor'), displayName: 'Cory Contractor', signIn: 'magic_link' },
  planningBoardMember: {
    email: demo('pb.member'),
    displayName: 'Robin Vale',
    signIn: 'magic_link',
  },
  zbaMember: { email: demo('zba.member'), displayName: 'Drew Hale', signIn: 'magic_link' },
}

const ACCOUNT_BY_ROLE: ReadonlyMap<SignedInRoleKey, Account> = new Map(
  Object.entries(ACCOUNTS) as [SignedInRoleKey, Account][],
)

export function accountFor(role: SignedInRoleKey): Account {
  const account = ACCOUNT_BY_ROLE.get(role)
  if (account === undefined) throw new Error(`no e2e account for role "${role}"`)
  return account
}

export const STAFF_DEMO_EMAILS: readonly string[] = [
  ...STAFF_ROLE_KEYS.map((key) => accountFor(key).email),
  demo('fire'),
  demo('works'),
]

export function authStatePath(role: SignedInRoleKey): string {
  return path.join(E2E_AUTH_DIR, `${role}.json`)
}
