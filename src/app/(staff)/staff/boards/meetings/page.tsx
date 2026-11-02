import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadBoardsView } from '@/features/boards/boardsView'
import { requireStaffContext } from '@/server/requireStaff'
import { cancelMeetingAction, scheduleMeetingAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function MeetingsPage() {
  const ctx = await requireStaffContext()
  const view = await loadBoardsView(ctx.db, ctx.actor, ctx.signal)
  if (view === null)
    return <NoPermission title="Meeting calendar" action="keep the meeting calendar" />
  return (
    <main className="space-y-8">
      <p>
        <Link href="/staff/boards" className="text-action underline">
          Boards
        </Link>
      </p>
      <h1>Meeting calendar</h1>
      <p className="max-w-prose text-muted-foreground">
        The date a completeness decision is due depends on the next regular meeting. Adding or
        cancelling a regular meeting recalculates those dates.
      </p>
      {view.sections.map((section) => (
        <section key={section.board} aria-label={section.label} className="space-y-3">
          <h2>{section.label}</h2>
          <ul className="m-0 list-none space-y-2 p-0">
            {section.meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-end gap-4 border-b pb-2">
                <p className="m-0 min-w-72 flex-1">
                  <Link href={`/staff/boards/meetings/${m.id}`} className="text-action underline">
                    {m.dateText}
                  </Link>
                  {`, ${m.kindText}${m.location === '' ? '' : `, ${m.location}`}`}
                  {m.cancelled ? `. Cancelled: ${m.cancelReason ?? ''}` : ''}
                  {m.past && !m.cancelled ? ' (past)' : ''}
                </p>
                {m.cancelled || m.past ? null : (
                  <details>
                    <summary>Cancel</summary>
                    <ActionForm action={cancelMeetingAction} submitLabel="Cancel meeting">
                      <input type="hidden" name="meetingId" value={m.id} />
                      <TextField label="Reason" name="reason" required />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <details>
            <summary>{`Add a meeting to the ${section.label} calendar`}</summary>
            <ActionForm
              action={scheduleMeetingAction}
              submitLabel="Add meeting"
              className="max-w-md"
            >
              <input type="hidden" name="board" value={section.board} />
              <TextField label="Date" name="meetingDate" type="date" required />
              <SelectField
                label="Kind"
                name="kind"
                options={[
                  ['regular', 'Regular meeting'],
                  ['special', 'Special meeting'],
                ]}
              />
              <TextField label="Location" name="location" />
            </ActionForm>
          </details>
        </section>
      ))}
    </main>
  )
}
