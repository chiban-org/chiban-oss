import Link from 'next/link'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { USERS_PATH } from '@/features/users/userListParams'
import { requireStaffContext } from '@/server/requireStaff'
import { InviteForm } from './InviteForm'

export const dynamic = 'force-dynamic'

export default async function InviteStaffPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'user.manage', ctx.signal))) {
    return <NoPermission title="Invite staff" action="manage staff accounts" />
  }
  return (
    <main className="space-y-6">
      <header>
        <p className="m-0 mb-1 text-sm">
          <Link href={USERS_PATH} className="text-action underline">
            Users
          </Link>
        </p>
        <h1 className="m-0 mb-1">Invite staff</h1>
        <p className="m-0 max-w-[65ch] text-muted-foreground">
          We email a link that works once for 7 days. They choose a password and land on their start
          page. They can add an authenticator app from Account.
        </p>
      </header>
      <InviteForm />
    </main>
  )
}
