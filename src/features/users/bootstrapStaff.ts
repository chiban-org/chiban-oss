import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import { seedGrantsForRolesWithNone } from '@/features/authz/defaultGrants'
import type { MailTransport } from '@/features/mail/transport'
import { ensureDefaultReportSchedules } from '@/features/reports/defaultSchedules'
import { deliver } from '@/features/users/invite'
import { issueLink, linkUrl } from '@/features/users/links'
import { inviteMessage } from '@/features/users/mailCopy'
import { lockStaffAccounts, parseStaffRoles } from '@/features/users/staffAccounts'
import { err, ok, type Result } from '@/types/result'

export interface BootstrapStaffInput {
  email: string
  displayName: string
  role: string
}

export type BootstrapStaffError = 'invalid_input' | 'invalid_role' | 'email_taken'

export interface BootstrapStaffResult {
  userId: string
  setPasswordUrl: string
  emailSent: boolean | null
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function bootstrapStaff(
  db: Db,
  input: BootstrapStaffInput,
  options: { now: Date; signal: AbortSignal; mail?: MailTransport },
): Promise<Result<BootstrapStaffResult, BootstrapStaffError>> {
  const { now, signal, mail } = options
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (displayName === '' || !EMAIL_SHAPE.test(email)) return err('invalid_input')
  const roles = parseStaffRoles([input.role])
  if (roles === null) return err('invalid_role')
  const created = await transactionResult<{ userId: string; token: string }, BootstrapStaffError>(
    db,
    async (tx) => {
      await lockStaffAccounts(tx)
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      if (taken !== undefined) return err('email_taken')
      const [row] = await tx
        .insert(users)
        .values({ email, displayName, kind: 'staff' })
        .returning({ id: users.id })
      const userId = row?.id ?? ''
      await tx.insert(userRoles).values(roles.map((role) => ({ userId, role })))
      const token = await issueLink(tx, { userId, purpose: 'invite', createdBy: userId }, now)
      await writeAudit(
        tx,
        {
          actor: { kind: 'system', job: 'create-staff-user' },
          action: 'user.invite',
          entityType: 'user',
          entityId: userId,
          after: { email, roles },
        },
        signal,
      )
      return ok({ userId, token })
    },
  )
  if (!created.ok) return created
  const { userId, token } = created.value
  await seedGrantsForRolesWithNone(db, signal)
  if (roles.includes('admin')) {
    await ensureDefaultReportSchedules(db, { adminUserId: userId, now }, signal)
  }
  const setPasswordUrl = linkUrl(token)
  const emailSent =
    mail === undefined
      ? null
      : await deliver(mail, inviteMessage({ email, displayName, roles }, setPasswordUrl), signal)
  return ok({ userId, setPasswordUrl, emailSent })
}
