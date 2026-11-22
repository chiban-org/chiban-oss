import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import type { RtkRequestView } from '@/features/rtk/requests'
import { clarificationAnswerAction } from '../actions'

export function answerOpen(request: RtkRequestView): boolean {
  const unanswered = typeof request.clarificationAnswer !== 'string'
  const open = request.status !== 'closed' && request.status !== 'withdrawn'
  return typeof request.clarificationQuestion === 'string' && unanswered && open
}

export function AnswerForm({ request }: { request: RtkRequestView }) {
  if (!answerOpen(request)) return null
  return (
    <details data-slot="clarification-answer">
      <summary>Record the requester answer</summary>
      <ActionForm
        action={clarificationAnswerAction}
        submitLabel="Record the answer"
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="requestId" value={request.id} />
        <AreaField label="What the requester answered" name="answer" maxLength={5000} required />
        <TextField label="Date of the answer" name="answeredOn" type="date" required />
      </ActionForm>
    </details>
  )
}
