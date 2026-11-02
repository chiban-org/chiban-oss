import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { markHeldAction } from '../actions'

export function HeldForm({
  hearingId,
  meetingDate,
  meetingText,
  today,
}: {
  hearingId: string
  meetingDate: string
  meetingText: string
  today: string
}) {
  if (meetingDate > today) {
    return <p>{`Mark the hearing held after the meeting on ${meetingText}.`}</p>
  }
  return (
    <ActionForm
      action={markHeldAction}
      submitLabel="Mark the hearing held"
      variant="default"
      className="max-w-md"
    >
      <input type="hidden" name="hearingId" value={hearingId} />
      <TextField
        label="Date held"
        name="heldOn"
        type="date"
        defaultValue={meetingDate}
        min={meetingDate}
        max={today}
        required
      />
    </ActionForm>
  )
}
