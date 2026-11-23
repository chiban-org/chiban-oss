import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ConfirmStep } from '@/components/useConfirmStep'
import { DEFAULT_MEETING_START_MINUTE, minuteToTimeInput } from '@/features/boards/meetingTime'
import { scheduleMeetingAction } from '../actions'

function pastMeetingConfirm(today: string): ConfirmStep {
  return {
    title: 'Add a meeting dated in the past?',
    body: 'The date is before today. Add a past meeting only to record a meeting that was already held.',
    confirmLabel: 'Add the past meeting',
    tone: 'default',
    when: { name: 'meetingDate', before: today },
  }
}

export function AddMeeting({ boards, today }: { boards: [string, string][]; today: string }) {
  return (
    <FormDialog label="Add meeting" title="Add a meeting" variant="default">
      <ActionForm
        action={scheduleMeetingAction}
        submitLabel="Add meeting"
        className="max-w-md"
        confirm={pastMeetingConfirm(today)}
      >
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
