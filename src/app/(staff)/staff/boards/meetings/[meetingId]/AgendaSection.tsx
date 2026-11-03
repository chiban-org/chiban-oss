import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { MeetingAgendaView, MeetingView } from '@/features/hearings/meetingView'
import {
  addAgendaItemAction,
  buildAgendaAction,
  moveAgendaItemAction,
  removeAgendaItemAction,
  reopenAgendaAction,
} from '../../hearings/actions'

function ItemControls({ item }: { item: MeetingAgendaView['items'][number] }) {
  return (
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
  )
}

function DraftControls({ meetingId }: { meetingId: string }) {
  return (
    <div className="space-y-3">
      <ActionForm action={buildAgendaAction} submitLabel="Add the scheduled hearings">
        <input type="hidden" name="meetingId" value={meetingId} />
      </ActionForm>
      <details>
        <summary>Add an item</summary>
        <ActionForm action={addAgendaItemAction} submitLabel="Add item" className="max-w-md">
          <input type="hidden" name="meetingId" value={meetingId} />
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
    </div>
  )
}

export function AgendaSection({ view }: { view: MeetingView }) {
  const { agenda } = view
  const draft = agenda === null || agenda.status === 'draft'
  return (
    <section aria-labelledby="agenda" className="space-y-4">
      <h2 id="agenda">Agenda</h2>
      {agenda === null || agenda.items.length === 0 ? (
        <p>The agenda has no items yet.</p>
      ) : (
        <ol className="space-y-3">
          {agenda.items.map((item) => (
            <li key={item.id} className="space-y-1">
              <p className="m-0">{item.line}</p>
              {item.description === '' ? null : <p className="m-0 text-sm">{item.description}</p>}
              {draft ? <ItemControls item={item} /> : null}
            </li>
          ))}
        </ol>
      )}
      {draft ? (
        <DraftControls meetingId={view.meetingId} />
      ) : (
        <ActionForm action={reopenAgendaAction} submitLabel="Reopen the agenda">
          <input type="hidden" name="meetingId" value={view.meetingId} />
        </ActionForm>
      )}
    </section>
  )
}
