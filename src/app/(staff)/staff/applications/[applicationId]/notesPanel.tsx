import { ActionForm } from '@/components/ActionForm'
import { AreaField } from '@/components/staff/fields'
import { NOTE_MAX_LENGTH } from '@/features/applications/noteLimits'
import type { ApplicationNote } from '@/features/applications/notes'
import { formatInstant } from '@/lib/formatDate'
import { addApplicationNoteAction } from './notesActions'

interface Props {
  applicationId: string
  notes: ApplicationNote[]
  canAdd: boolean
  zone: string
}

export function NotesPanel({ applicationId, notes, canAdd, zone }: Props) {
  return (
    <section aria-label="Staff notes" id="notes">
      <h2>Staff notes</h2>
      <p className="text-muted-foreground">
        For town staff working this application. Applicants, reviewers and board members do not see
        these notes.
      </p>
      {notes.length === 0 ? <p>No notes yet.</p> : null}
      <ul className="list-none space-y-2 p-0">
        {notes.map((n) => (
          <li key={n.id} className="record-item">
            <p className="m-0 font-medium">{`${n.authorName ?? 'Staff'}, ${formatInstant(n.createdAt, zone)}`}</p>
            <p className="m-0 whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      {canAdd ? (
        <details>
          <summary>Add a note</summary>
          <ActionForm action={addApplicationNoteAction} submitLabel="Add note">
            <input type="hidden" name="applicationId" value={applicationId} />
            <AreaField label="Note" name="body" rows={3} maxLength={NOTE_MAX_LENGTH} required />
          </ActionForm>
        </details>
      ) : null}
    </section>
  )
}
