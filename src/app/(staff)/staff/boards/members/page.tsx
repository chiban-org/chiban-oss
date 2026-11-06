import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { ListHeader } from '@/components/layout/ListHeader'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import {
  MEMBER_SORT,
  MEMBERS_PATH,
  type MemberSortKey,
  readMembersView,
} from '@/features/boards/membersParams'
import { type BoardOption, loadMembersView, type MemberRow } from '@/features/boards/membersView'
import { pagerLinks } from '@/features/dataTable/pageSlice'
import { type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { type SortLink, sortLinks } from '@/features/dataTable/sort'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { endMembershipAction } from './actions'
import { AddMember, EditMember } from './MemberForm'

export const metadata: Metadata = { title: 'Board members' }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

function EndMembership({ row }: { row: MemberRow }) {
  return (
    <ActionForm
      action={endMembershipAction}
      submitLabel="End membership"
      confirm={{
        title: `End ${row.name}'s membership?`,
        body: `${row.name} is no longer seated on ${row.boardName}.`,
        confirmLabel: 'End membership',
      }}
      compact
    >
      <input type="hidden" name="membershipId" value={row.membershipId} />
    </ActionForm>
  )
}

function MembersTable({
  rows,
  links,
  ending,
  today,
  boards,
}: {
  rows: MemberRow[]
  links: Record<MemberSortKey, SortLink>
  ending: boolean
  today: string
  boards: readonly BoardOption[]
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
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
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
            <td>
              <StatusChip status={row.active ? 'passed' : 'neutral'} label={row.statusText} />
            </td>
            <td>
              <div className="row-actions">
                <EditMember row={row} today={today} boards={boards} />
                {ending && row.active ? <EndMembership row={row} /> : null}
              </div>
            </td>
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
  const view = await loadMembersView(
    ctx.db,
    ctx.actor,
    { today, tab, sort, limit: PAGE_SIZE, offset: readOffset(params) },
    ctx.signal,
  )
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
    <main data-wide="">
      <ListHeader
        title="Board members"
        lead="Members sign in with a link sent to their email. They see only their own board's meetings, and only after the agenda is published. Listed by board, then name."
        actions={<AddMember today={today} boards={view.boardOptions} />}
      />
      <FilterTabs label="Members" tabs={tabs} />
      <div className="table-panel">
        {view.rows.length === 0 ? (
          <p className="px-5 py-8">
            {tab === 'active'
              ? 'No board members yet. Add the first one with Add member.'
              : 'No membership has ended yet.'}
          </p>
        ) : (
          <MembersTable
            rows={view.rows}
            links={sortLinks(MEMBERS_PATH, params, MEMBER_SORT, sort)}
            ending={tab === 'active'}
            today={today}
            boards={view.boardOptions}
          />
        )}
      </div>
      <TablePager {...pagerLinks(MEMBERS_PATH, params, view)} />
    </main>
  )
}
