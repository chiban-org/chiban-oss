import Link from 'next/link'
import { SortBar, SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import type { SortLink } from '@/features/dataTable/sort'
import type { Status } from '@/features/design/tokens'
import type { StaffStatus } from '@/features/users/staffAccounts'
import type { UserRow } from '@/features/users/userList'
import { USERS_PATH, type UserSortKey } from '@/features/users/userListParams'
import { cn } from '@/lib/utils'

export const STATUS_LABEL: Record<StaffStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  disabled: 'Disabled',
}

export const STATUS_CHIP: Record<StaffStatus, Status> = {
  active: 'passed',
  invited: 'overdue',
  disabled: 'neutral',
}

const WIDE_ONLY = 'hidden sm:table-cell'

const COLUMNS: readonly (readonly [UserSortKey, string])[] = [
  ['name', 'Name'],
  ['email', 'Email'],
  ['roles', 'Roles'],
  ['authenticator', 'Authenticator'],
]

export function UsersSortBar({ links }: { links: Record<UserSortKey, SortLink> }) {
  return (
    <SortBar
      className="sm:hidden"
      options={COLUMNS.map(([key, label]) => ({ label, link: links[key] }))}
    />
  )
}

export function UsersTable({
  rows,
  links,
}: {
  rows: UserRow[]
  links: Record<UserSortKey, SortLink>
}) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Staff accounts</caption>
      <thead>
        <tr>
          <SortHeader label="Name" link={links.name} />
          <SortHeader label="Email" link={links.email} className={WIDE_ONLY} />
          <SortHeader label="Roles" link={links.roles} />
          <th scope="col">Status</th>
          <SortHeader label="Authenticator" link={links.authenticator} className={WIDE_ONLY} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="align-top">
            <td>
              <Link href={`${USERS_PATH}/${row.id}`} className="font-semibold">
                {row.name}
              </Link>
              <span className="block text-muted-foreground [overflow-wrap:anywhere] sm:hidden">
                {row.email}
              </span>
              <span className="block text-muted-foreground sm:hidden">
                {`Authenticator ${row.authenticator ? 'on' : 'off'}`}
              </span>
            </td>
            <td className={WIDE_ONLY}>{row.email}</td>
            <td>
              {row.roleLabels.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                row.roleLabels.join(', ')
              )}
            </td>
            <td>
              <StatusChip status={STATUS_CHIP[row.status]} label={STATUS_LABEL[row.status]} />
            </td>
            <td className={cn(WIDE_ONLY, row.authenticator ? undefined : 'text-muted-foreground')}>
              {row.authenticator ? 'On' : 'Off'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
