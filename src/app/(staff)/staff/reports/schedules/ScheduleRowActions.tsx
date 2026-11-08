'use client'

import { ActionForm } from '@/components/ActionForm'
import { deleteScheduleAction, pauseScheduleAction, resumeScheduleAction } from './actions'

export function PauseSchedule({
  scheduleId,
  title,
  paused,
}: {
  scheduleId: string
  title: string
  paused: boolean
}) {
  return (
    <ActionForm
      action={paused ? resumeScheduleAction : pauseScheduleAction}
      submitLabel={paused ? 'Resume' : 'Pause'}
      submitAccessibleLabel={`${paused ? 'Resume' : 'Pause'} ${title}`}
      compact
    >
      <input type="hidden" name="scheduleId" value={scheduleId} />
    </ActionForm>
  )
}

export function DeleteSchedule({ scheduleId, title }: { scheduleId: string; title: string }) {
  return (
    <ActionForm
      action={deleteScheduleAction}
      submitLabel="Delete"
      submitAccessibleLabel={`Delete ${title}`}
      variant="destructive"
      confirm={{
        title: `Delete ${title}?`,
        body: 'No more emails go out for it. Reports already sent stay with the people who got them. To stop it for a while instead, pause it.',
        confirmLabel: 'Delete schedule',
      }}
      compact
    >
      <input type="hidden" name="scheduleId" value={scheduleId} />
    </ActionForm>
  )
}
