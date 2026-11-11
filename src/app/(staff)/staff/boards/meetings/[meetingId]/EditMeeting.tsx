import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { TextField } from '@/components/staff/fields'
import { minuteToTimeInput } from '@/features/boards/meetingTime'
import { updateMeetingAction } from './editActions'

export function EditMeeting({
  meetingId,
  startsAtMinute,
  location,
}: {
  meetingId: string
  startsAtMinute: number
  location: string
}) {
  return (
    <FormDialog
      label="Change time or place"
      title="Change the meeting time or place"
      description="The agenda, packet and public meetings page use the new time and place. Notices already mailed keep the old time, so send corrected ones."
    >
      <ActionForm action={updateMeetingAction} submitLabel="Save" className="max-w-md">
        <input type="hidden" name="meetingId" value={meetingId} />
        <TextField
          label="Start time"
          name="startsAt"
          type="time"
          defaultValue={minuteToTimeInput(startsAtMinute)}
          hint="In the town time zone."
          required
        />
        <TextField label="Location" name="location" defaultValue={location} />
      </ActionForm>
    </FormDialog>
  )
}
