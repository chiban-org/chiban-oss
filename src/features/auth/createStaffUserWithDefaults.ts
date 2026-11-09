import type { Db } from '@/db/client'
import { type CreateStaffUserInput, createStaffUser } from '@/features/auth/createStaffUser'
import { seedGrantsForRolesWithNone } from '@/features/authz/defaultGrants'
import { ensureDefaultReportSchedules } from '@/features/reports/defaultSchedules'

export async function createStaffUserWithDefaults(
  db: Db,
  input: CreateStaffUserInput,
  now: Date,
  signal: AbortSignal,
): ReturnType<typeof createStaffUser> {
  const created = await createStaffUser(db, input, signal)
  if (created.ok) await seedGrantsForRolesWithNone(db, signal)
  if (created.ok && input.role === 'admin') {
    await ensureDefaultReportSchedules(db, { adminUserId: created.value.userId, now }, signal)
  }
  return created
}
