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
      <ActionForm
        action={removeAgendaItemAction}
        submitLabel="Remove"
        confirm={{
          title: 'Remove this item from the agenda?',
          body: `“${item.text}” comes off this draft agenda. You can add it again before the agenda goes on the public site.`,
          confirmLabel: 'Remove the item',
        }}
      >
        <input type="hidden" name="itemId" value={item.id} />
      </ActionForm>
    </div>
  )
}

type FormVariant = 'default' | 'outline'

export function AddHearingsForm({
  meetingId,
  variant,
}: {
  meetingId: string
  variant?: FormVariant
}) {
  return (
    <ActionForm
      action={buildAgendaAction}
      submitLabel="Add the scheduled hearings"
      {...(variant === undefined ? {} : { variant })}
    >
      <input type="hidden" name="meetingId" value={meetingId} />
    </ActionForm>
  )
}

export function AddItemForm({
  meetingId,
  submitLabel,
  variant,
}: {
  meetingId: string
  submitLabel: string
  variant?: FormVariant
}) {
  return (
    <ActionForm
      action={addAgendaItemAction}
      submitLabel={submitLabel}
      className="max-w-md"
      {...(variant === undefined ? {} : { variant })}
    >
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
  )
}

function DraftControls({ view }: { view: MeetingView }) {
  const empty = view.agenda === null || view.agenda.items.length === 0
  const hasHearings = view.hearings.length > 0
  return (
    <div className="space-y-3">
      {hasHearings && !empty ? <AddHearingsForm meetingId={view.meetingId} /> : null}
      {empty && !hasHearings ? null : (
        <details>
          <summary>Add an item</summary>
          <AddItemForm meetingId={view.meetingId} submitLabel="Add item" />
        </details>
      )}
    </div>
  )
}

function AgendaControls({ view, draft }: { view: MeetingView; draft: boolean }) {
  if (view.cancelled) return null
  return draft ? (
    <DraftControls view={view} />
  ) : (
    <ActionForm
      action={reopenAgendaAction}
      submitLabel="Reopen the agenda"
      confirm={{
        title: 'Take the agenda off the board and meetings pages and reopen it?',
        body: 'It comes off the board page and the meetings page and goes back to a draft so you can change it. Show it on the public site again when you are done.',
        confirmLabel: 'Reopen the agenda',
      }}
    >
      <input type="hidden" name="meetingId" value={view.meetingId} />
    </ActionForm>
  )
}

export function AgendaSection({ view }: { view: MeetingView }) {
  const { agenda } = view
  const draft = agenda === null || agenda.status === 'draft'
  const editable = draft && !view.cancelled
  return (
    <section aria-labelledby="agenda">
      <h2 id="agenda">Agenda</h2>
      {agenda === null || agenda.items.length === 0 ? (
        <p>
          {view.cancelled
            ? 'The meeting was cancelled before its agenda had any items.'
            : 'The agenda has no items yet.'}
        </p>
      ) : (
        <ol className="space-y-3">
          {agenda.items.map((item) => (
            <li key={item.id} className="space-y-1">
              <p>{item.line}</p>
              {item.description === '' ? null : <p className="text-sm">{item.description}</p>}
              {editable ? <ItemControls item={item} /> : null}
            </li>
          ))}
        </ol>
      )}
      <AgendaControls view={view} draft={draft} />
    </section>
  )
}
