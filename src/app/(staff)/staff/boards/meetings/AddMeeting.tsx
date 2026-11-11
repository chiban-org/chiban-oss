import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import { DEFAULT_MEETING_START_MINUTE, minuteToTimeInput } from '@/features/boards/meetingTime'
import { scheduleMeetingAction } from '../actions'

export function AddMeeting({ boards }: { boards: [string, string][] }) {
  return (
    <FormDialog label="Add meeting" title="Add a meeting" variant="default">
      <ActionForm action={scheduleMeetingAction} submitLabel="Add meeting" className="max-w-md">
        <SelectField label="Board" name="boardId" options={boards} />
        <TextField label="Date" name="meetingDate" type="date" required />
        <TextField
          label="Start time"
          name="startsAt"
          type="time"
          defaultValue={minuteToTimeInput(DEFAULT_MEETING_START_MINUTE)}
          hint="In the town time zone."
          required
        />
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
    </FormDialog>
  )
}
