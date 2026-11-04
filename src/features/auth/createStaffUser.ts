import { type Role, STAFF_ROLES } from '@/constants/roles'
import type { DbOrTx } from '@/db/client'
import { userRoles, users } from '@/db/schema'
import { hashPassword } from '@/features/auth/password'
import { err, ok, type Result } from '@/types/result'

export const MIN_PASSWORD_LENGTH = 12
const UNIQUE_VIOLATION = '23505'

export interface CreateStaffUserInput {
  email: string
  displayName: string
  role: Role
  password: string
}

function pgCode(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const direct = (e as { code?: unknown }).code
  if (typeof direct === 'string') return direct
  const cause = (e as { cause?: unknown }).cause
  return cause === undefined ? undefined : pgCode(cause)
}

export async function createStaffUser(
  db: DbOrTx,
  input: CreateStaffUserInput,
  signal: AbortSignal,
): Promise<Result<{ userId: string }, 'invalid_role' | 'weak_password' | 'email_taken'>> {
  signal.throwIfAborted()
  if (!STAFF_ROLES.includes(input.role)) return err('invalid_role')
  if (input.password.length < MIN_PASSWORD_LENGTH) return err('weak_password')
  const passwordHash = await hashPassword(input.password, signal)
  try {
    const [row] = await db
      .insert(users)
      .values({
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName,
        kind: 'staff',
        passwordHash,
      })
      .returning({ id: users.id })
    const userId = row?.id ?? ''
    await db.insert(userRoles).values({ userId, role: input.role })
    return ok({ userId })
  } catch (e) {
    if (pgCode(e) === UNIQUE_VIOLATION) return err('email_taken')
    throw e
  }
}
