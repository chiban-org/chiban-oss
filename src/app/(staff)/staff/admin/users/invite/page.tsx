import type { Metadata } from 'next'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { USERS_PATH } from '@/features/users/userListParams'
import { requireStaffContext } from '@/server/requireStaff'
import { InviteForm } from './InviteForm'

export const metadata: Metadata = { title: 'Invite staff' }

export const dynamic = 'force-dynamic'

export default async function InviteStaffPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'user.manage', ctx.signal))) {
    return <NoPermission title="Invite staff" action="manage staff accounts" />
  }
  return (
    <main>
      <SettingsHeader
        title="Invite staff"
        lead="We email a link that works once for 7 days. They choose a password and land on their start page, and can add an authenticator app from Account."
        back={{ href: USERS_PATH, label: 'Users' }}
      />
      <InviteForm />
    </main>
  )
}
