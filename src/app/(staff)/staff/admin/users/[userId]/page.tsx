import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { TransientNotice } from '@/components/TransientNotice'
import { hasCapability } from '@/features/authz/capabilities'
import { townTimeZone } from '@/features/town/timeZone'
import { unsentCopy } from '@/features/users/errorCopy'
import { loadUserDetail } from '@/features/users/userDetail'
import { USERS_PATH } from '@/features/users/userListParams'
import { requireStaffContext } from '@/server/requireStaff'
import { STATUS_CHIP, STATUS_LABEL } from '../UsersTable'
import { AccessPanel } from './AccessPanel'
import { HistoryPanel } from './HistoryPanel'
import { RolesPanel } from './RolesPanel'
import { UserRail } from './UserRail'

export const dynamic = 'force-dynamic'

const NOTICES: Readonly<Record<string, string>> = {
  invited: 'Invite sent. The link works once for 7 days.',
  unsent: unsentCopy('The account was created.'),
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ notice?: string }>
}) {
  const [{ userId }, { notice }] = await Promise.all([params, searchParams])
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'user.manage', ctx.signal))) {
    return <NoPermission title="Staff account" action="manage staff accounts" />
  }
  const detail = await loadUserDetail(ctx.db, ctx.actor, userId, ctx.signal)
  if (detail === null) notFound()
  const timeZone = await townTimeZone(ctx.db, ctx.signal)
  const message = notice === undefined ? undefined : new Map(Object.entries(NOTICES)).get(notice)
  const sections = splitPanels([
    { empty: false, node: <RolesPanel key="roles" detail={detail} /> },
    { empty: false, node: <AccessPanel key="access" detail={detail} /> },
    {
      empty: detail.history.length === 0,
      node: <HistoryPanel key="history" detail={detail} timeZone={timeZone} />,
    },
  ])
  return (
    <main>
      <PageHeader
        kicker={<Link href={USERS_PATH}>Users</Link>}
        title={detail.displayName}
        status={
          <StatusChip status={STATUS_CHIP[detail.status]} label={STATUS_LABEL[detail.status]} />
        }
        lead={detail.isSelf ? `${detail.email}. This is your account.` : detail.email}
      />
      {message === undefined ? null : <TransientNotice>{message}</TransientNotice>}
      <RecordLayout rail={<UserRail detail={detail} timeZone={timeZone} />} empty={sections.empty}>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
