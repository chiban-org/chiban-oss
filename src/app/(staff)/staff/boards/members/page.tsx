import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadMembersView } from '@/features/hearings/views'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { endMembershipAction, inviteMemberAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function BoardMembersPage() {
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const view = await loadMembersView(ctx.db, ctx.actor, ctx.signal, today)
  if (view === null) return <NoPermission title="Board members" action="manage board members" />
  return (
    <main className="space-y-6">
      <p>
        <Link href="/staff/boards" className="text-action underline">
          Boards
        </Link>
      </p>
      <h1>Board members</h1>
      <p className="max-w-prose text-muted-foreground">
        Members sign in with a link sent to their email. They see only their own board&apos;s
        meetings, and only after the agenda is published.
      </p>
      {view.rows.length === 0 ? <p>No board members have been added yet.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {view.rows.map((row) => (
          <li key={row.membershipId} className="flex flex-wrap items-end gap-4 border-b pb-2">
            <p className="m-0 min-w-72 flex-1">
              {`${row.name}, ${row.titleText}, ${row.boardName}. ${row.termText}. ${row.active ? 'Active' : 'Not active'}.`}
            </p>
            {row.active ? (
              <ActionForm action={endMembershipAction} submitLabel="End membership">
                <input type="hidden" name="membershipId" value={row.membershipId} />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      <details>
        <summary>Add a board member</summary>
        <ActionForm action={inviteMemberAction} submitLabel="Add member" className="max-w-md">
          <TextField label="Name" name="displayName" required />
          <TextField label="Email address" name="email" type="email" required />
          <SelectField
            label="Board"
            name="board"
            options={[
              ['planning_board', 'Planning Board'],
              ['zba', 'Zoning Board of Adjustment'],
            ]}
          />
          <SelectField
            label="Role on the board"
            name="title"
            options={[
              ['member', 'Member'],
              ['chair', 'Chair'],
              ['vice_chair', 'Vice chair'],
              ['alternate', 'Alternate'],
              ['clerk', 'Clerk'],
            ]}
          />
          <TextField
            label="Term starts"
            name="termStart"
            type="date"
            defaultValue={today}
            required
          />
          <TextField
            label="Term ends"
            name="termEnd"
            type="date"
            hint="Leave blank if there is no end date."
          />
        </ActionForm>
      </details>
    </main>
  )
}
