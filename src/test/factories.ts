import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import { userRoles, users } from '@/db/schema'

let counter = 0

export interface MakeUserInput {
  role?: Role
  roles?: Role[]
  email?: string
  kind?: 'staff' | 'public'
  isActive?: boolean
  passwordHash?: string | null
  totpSecretEnc?: string | null
  totpEnabled?: boolean
}

export async function makeUser(db: Db, input: MakeUserInput = {}): Promise<string> {
  counter += 1
  const roles = input.roles ?? [input.role ?? 'staff']
  const kind =
    input.kind ?? (roles.includes('applicant') || roles.includes('contractor') ? 'public' : 'staff')
  const rows = await db
    .insert(users)
    .values({
      email: input.email ?? `user${counter}@alderpond.example`,
      displayName: `User ${counter}`,
      kind,
      isActive: input.isActive ?? true,
      passwordHash: input.passwordHash ?? null,
      totpSecretEnc: input.totpSecretEnc ?? null,
      totpEnabled: input.totpEnabled ?? false,
    })
    .returning({ id: users.id })
  const id = rows[0]?.id ?? ''
  await db.insert(userRoles).values(roles.map((role) => ({ userId: id, role })))
  return id
}
