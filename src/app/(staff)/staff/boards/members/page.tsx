import { ActionForm } from '@/components/ActionForm'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import {
  MEMBER_SORT,
  MEMBERS_PATH,
  type MemberSortKey,
  readMembersView,
} from '@/features/boards/membersParams'
import { loadMembersView, type MemberRow } from '@/features/boards/membersView'
import type { RawSearchParams } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { type SortLink, sortLinks } from '@/features/dataTable/sort'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { endMembershipAction } from './actions'
import { AddMember } from './MemberForm'

export const dynamic = 'force-dynamic'

function MembersTable({
  rows,
  links,
  ending,
}: {
  rows: MemberRow[]
  links: Record<MemberSortKey, SortLink>
  ending: boolean
}) {
  return (
    <table className="w-full min-w-[48rem] text-sm">
      <caption className="sr-only">Board members</caption>
      <thead>
        <tr>
          <SortHeader label="Name" link={links.name} />
          <SortHeader label="Email" link={links.email} />
          <SortHeader label="Board" link={links.board} />
          <SortHeader label="Role" link={links.role} />
          <SortHeader label="Term" link={links.term} />
          <SortHeader label="Status" link={links.status} />
          {ending ? (
            <th scope="col">
              <span className="sr-only">End membership</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.membershipId} className="align-top">
            <td className="font-semibold">{row.name}</td>
            <td>{row.email}</td>
            <td>{row.boardName}</td>
            <td>{row.titleText}</td>
            <td>{row.termText}</td>
            <td>{row.statusText}</td>
            {ending ? (
              <td>
                {row.active ? (
                  <ActionForm action={endMembershipAction} submitLabel="End membership" compact>
                    <input type="hidden" name="membershipId" value={row.membershipId} />
                  </ActionForm>
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function BoardMembersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, tab, sort } = readMembersView(await searchParams)
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const view = await loadMembersView(ctx.db, ctx.actor, { today, tab, sort }, ctx.signal)
  if (view === null) return <NoPermission title="Board members" action="manage board members" />
  const tabs = filterTabs(MEMBERS_PATH, params, {
    param: 'tab',
    label: 'Members',
    defaultTab: 'active',
    options: [
      { value: 'active', label: 'Active', count: view.counts.get('active') ?? 0 },
      { value: 'ended', label: 'Ended', count: view.counts.get('ended') ?? 0 },
    ],
  })
  return (
    <main data-wide="" className="space-y-6">
      <h1>Board members</h1>
      <p className="max-w-prose">
        Members sign in with a link sent to their email. They see only their own board&apos;s
        meetings, and only after the agenda is published. Listed by board, then name.
      </p>
      <FilterTabs label="Members" tabs={tabs} />
      <div className="table-panel">
        {view.rows.length === 0 ? (
          <p className="px-5 py-8">
            {tab === 'active'
              ? 'No board members yet. Add the first one below.'
              : 'No membership has ended yet.'}
          </p>
        ) : (
          <MembersTable
            rows={view.rows}
            links={sortLinks(MEMBERS_PATH, params, MEMBER_SORT, sort)}
            ending={tab === 'active'}
          />
        )}
      </div>
      <AddMember today={today} />
    </main>
  )
}
