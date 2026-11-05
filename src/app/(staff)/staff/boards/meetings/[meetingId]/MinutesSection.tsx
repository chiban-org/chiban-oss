import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { SelectField, TextField } from '@/components/staff/fields'
import { currentMinutesText, type MeetingMinutesView } from '@/features/boards/minutesView'
import { MinutesUploader } from './MinutesUploader'
import {
  createMeetingUploadIntentAction,
  finalizeMeetingUploadAction,
  recordMinutesAction,
} from './minutesActions'

const UPLOAD_ACTIONS = {
  createIntent: createMeetingUploadIntentAction,
  finalize: finalizeMeetingUploadAction,
}

function RecordForm({
  meetingId,
  minutes,
  meetingDate,
  today,
  canApprove,
}: {
  meetingId: string
  minutes: MeetingMinutesView
  meetingDate: string
  today: string
  canApprove: boolean
}) {
  const statuses: [string, string][] = canApprove
    ? [
        ['draft', 'Draft, not yet approved'],
        ['approved', 'Approved by the board'],
      ]
    : [['draft', 'Draft, not yet approved']]
  return (
    <ActionForm action={recordMinutesAction} submitLabel="Record the minutes" className="max-w-md">
      <input type="hidden" name="meetingId" value={meetingId} />
      <SelectField
        label="Minutes"
        name="documentId"
        defaultValue={minutes.current?.documentId ?? ''}
        required
        options={[
          ['', 'Choose the minutes'],
          ...minutes.choices.map((c): [string, string] => [c.id, c.label]),
        ]}
      />
      <SelectField label="Status" name="status" options={statuses} />
      {canApprove ? (
        <TextField
          label="Date approved"
          name="approvedOn"
          type="date"
          min={meetingDate}
          max={today}
          hint="Needed when the board has approved them. Approved minutes become public."
        />
      ) : null}
    </ActionForm>
  )
}

export function MinutesSection({
  meetingId,
  minutes,
  open,
  meetingDate,
  today,
  canApprove,
}: {
  meetingId: string
  minutes: MeetingMinutesView
  open: boolean
  meetingDate: string
  today: string
  canApprove: boolean
}) {
  const approved = minutes.current?.status === 'approved'
  return (
    <section aria-labelledby="minutes">
      <h2 id="minutes">Minutes</h2>
      {minutes.current === null ? (
        <p>No minutes are recorded for this meeting.</p>
      ) : (
        <p>
          <a {...NEW_TAB} href={`/api/documents/${minutes.current.documentId}`}>
            {minutes.current.title}
          </a>
          {`. ${currentMinutesText(minutes.current)}`}
        </p>
      )}
      {approved || !open ? null : (
        <>
          <MinutesUploader meetingId={meetingId} actions={UPLOAD_ACTIONS} />
          {minutes.choices.length === 0 ? null : (
            <RecordForm
              meetingId={meetingId}
              minutes={minutes}
              meetingDate={meetingDate}
              today={today}
              canApprove={canApprove}
            />
          )}
        </>
      )}
    </section>
  )
}
