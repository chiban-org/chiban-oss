import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { loadMeetingView } from '@/features/hearings/views'
import { requireStaffContext } from '@/server/requireStaff'
import {
  addAgendaItemAction,
  buildAgendaAction,
  createMeetingPacketAction,
  moveAgendaItemAction,
  publishAgendaAction,
  removeAgendaItemAction,
  reopenAgendaAction,
} from '../../hearings/actions'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Meeting" action="work with meetings" />
  }
  if (!UUID.test(meetingId)) notFound()
  const view = await loadMeetingView(ctx.db, ctx.actor, meetingId, ctx.signal)
  if (view === null) notFound()
  const draft = view.agenda === null || view.agenda.status === 'draft'
  return (
    <main className="space-y-6">
      <p>
        <Link href="/staff/boards/meetings" className="text-action underline">
          Meeting calendar
        </Link>
      </p>
      <h1>{`${view.boardName}, ${view.dateText}`}</h1>
      {view.locationText === '' ? null : <p>{view.locationText}</p>}
      <h2>Hearings at this meeting</h2>
      {view.hearings.length === 0 ? <p>No hearings are scheduled for this meeting.</p> : null}
      <ul className="m-0 list-none space-y-1 p-0">
        {view.hearings.map((h) => (
          <li key={h.id}>
            <Link href={`/staff/boards/hearings/${h.id}`} className="text-action underline">
              {h.text}
            </Link>
            {`. ${h.statusText}.`}
          </li>
        ))}
      </ul>
      <h2>Agenda</h2>
      {view.agenda === null ? <p>The agenda has not been started.</p> : null}
      {view.agenda === null ? null : (
        <p>
          {view.agenda.status === 'published'
            ? `Published on the public site, revision ${view.agenda.revision}.`
            : 'Draft. Not yet public.'}
        </p>
      )}
      {view.agenda === null ? null : (
        <ol className="space-y-2">
          {view.agenda.items.map((item) => (
            <li key={item.id} className="space-y-1">
              <p className="m-0">{`${item.kindText}: ${item.text}`}</p>
              {item.description === '' ? null : <p className="m-0 text-sm">{item.description}</p>}
              {draft ? (
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={moveAgendaItemAction} submitLabel="Move up">
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="toPosition" value={Math.max(0, item.position - 1)} />
                  </ActionForm>
                  <ActionForm action={moveAgendaItemAction} submitLabel="Move down">
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="toPosition" value={item.position + 1} />
                  </ActionForm>
                  <ActionForm action={removeAgendaItemAction} submitLabel="Remove">
                    <input type="hidden" name="itemId" value={item.id} />
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {draft ? (
        <div className="space-y-3">
          <ActionForm action={buildAgendaAction} submitLabel="Add the scheduled hearings">
            <input type="hidden" name="meetingId" value={view.meetingId} />
          </ActionForm>
          <details>
            <summary>Add an item</summary>
            <ActionForm action={addAgendaItemAction} submitLabel="Add item" className="max-w-md">
              <input type="hidden" name="meetingId" value={view.meetingId} />
              <SelectField
                label="Kind"
                name="kind"
                options={[
                  ['business', 'Business'],
                  ['minutes_approval', 'Minutes'],
                  ['other', 'Other'],
                ]}
              />
              <TextField label="Title" name="title" required />
              <AreaField label="Details" name="description" />
            </ActionForm>
          </details>
          {view.agenda === null || view.agenda.items.length === 0 ? null : (
            <ActionForm
              action={publishAgendaAction}
              submitLabel="Publish the agenda"
              variant="default"
            >
              <input type="hidden" name="meetingId" value={view.meetingId} />
            </ActionForm>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <ActionForm action={reopenAgendaAction} submitLabel="Reopen the agenda">
            <input type="hidden" name="meetingId" value={view.meetingId} />
          </ActionForm>
          <ActionForm
            action={createMeetingPacketAction}
            submitLabel="Create the meeting packet"
            variant="default"
          >
            <input type="hidden" name="meetingId" value={view.meetingId} />
          </ActionForm>
        </div>
      )}
    </main>
  )
}
