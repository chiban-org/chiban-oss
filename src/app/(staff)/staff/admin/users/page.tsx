import Link from 'next/link'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { Button } from '@/components/ui/button'
import type { RawSearchParams } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import type { StaffStatus } from '@/features/users/staffAccounts'
import { loadUserList } from '@/features/users/userList'
import { readUserListView, USER_SORT, USERS_PATH } from '@/features/users/userListParams'
import { requireStaffContext } from '@/server/requireStaff'
import { STATUS_LABEL, UsersSortBar, UsersTable } from './UsersTable'

export const dynamic = 'force-dynamic'

const EMPTY: Record<StaffStatus, string> = {
  active: 'No active staff accounts. Invite the first person with Invite staff.',
  invited: 'No invites are waiting. Invite staff to add someone.',
  disabled: 'No account is disabled.',
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, tab, sort } = readUserListView(await searchParams)
  const ctx = await requireStaffContext()
  const list = await loadUserList(ctx.db, ctx.actor, { tab, sort }, ctx.signal)
  if (list === null) return <NoPermission title="Users" action="manage staff accounts" />
  const tabs = filterTabs(USERS_PATH, params, {
    param: 'tab',
    label: 'Accounts',
    defaultTab: 'active',
    options: (['active', 'invited', 'disabled'] as const).map((value) => ({
      value,
      label: STATUS_LABEL[value],
      count: list.counts.get(value) ?? 0,
    })),
  })
  const links = sortLinks(USERS_PATH, params, USER_SORT, sort)
  return (
    <main data-wide="" className="space-y-6">
      <SettingsHeader
        title="Users"
        lead="Staff and board accounts that sign in with a password. Listed by name."
        action={
          <Button asChild className="no-underline">
            <Link href={`${USERS_PATH}/invite`}>Invite staff</Link>
          </Button>
        }
      />
      <FilterTabs label="Accounts" tabs={tabs} />
      <UsersSortBar links={links} />
      <div className="table-panel">
        {list.rows.length === 0 ? (
          <p className="px-5 py-8">{EMPTY[tab]}</p>
        ) : (
          <UsersTable rows={list.rows} links={links} />
        )}
      </div>
    </main>
  )
}
