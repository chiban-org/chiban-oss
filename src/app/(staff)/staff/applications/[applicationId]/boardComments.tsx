import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ApplicationBoardAssignment } from '@/features/reviews/boardAssignmentView'
import { formatCivilDate, formatInstant } from '@/lib/formatDate'
import { sendToBoardAction, withdrawBoardAction } from '../../reviews/actions'

export function offeredBoards(
  assignments: Pick<ApplicationBoardAssignment, 'boardId'>[],
  choices: { id: string; name: string }[],
) {
  const assigned = new Set(assignments.map((a) => a.boardId))
  return choices.filter((c) => !assigned.has(c.id))
}

export function SendToBoardForm({
  applicationId,
  offered,
}: {
  applicationId: string
  offered: { id: string; name: string }[]
}) {
  return (
    <ActionForm action={sendToBoardAction} submitLabel="Send to the board" variant="outline">
      <input type="hidden" name="applicationId" value={applicationId} />
      <SelectField
        label="Board"
        name="boardId"
        options={offered.map((c): [string, string] => [c.id, c.name])}
      />
      <TextField label="Comment by" name="commentBy" type="date" hint="Optional." />
    </ActionForm>
  )
}

function WithdrawBoard({ assignment }: { assignment: ApplicationBoardAssignment }) {
  const name = assignment.boardName
  return (
    <details>
      <summary
        aria-label={`Withdraw ${name}`}
        className="text-sm font-normal text-status-failed-fg"
      >
        Withdraw
      </summary>
      <ActionForm
        action={withdrawBoardAction}
        submitLabel={`Withdraw the request to ${name}`}
        variant="destructive"
        compact
        confirm={{
          title: `Withdraw the request to ${name}?`,
          body: `Members of the ${name} will no longer see this application.`,
          confirmLabel: 'Withdraw the request',
        }}
      >
        <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
      </ActionForm>
    </details>
  )
}

function BoardAssignmentItem({
  assignment,
  canManage,
  zone,
}: {
  assignment: ApplicationBoardAssignment
  canManage: boolean
  zone: string
}) {
  return (
    <li className="record-item space-y-2 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span>{assignment.boardName}</span>
            <StatusChip
              status={assignment.status === 'commented' ? 'passed' : 'neutral'}
              label={assignment.statusLabel}
            />
          </p>
          {assignment.commentBy === null ? null : (
            <p className="text-sm">{`Comments by ${formatCivilDate(assignment.commentBy)}`}</p>
          )}
        </div>
        {canManage ? <WithdrawBoard assignment={assignment} /> : null}
      </div>
      {assignment.comments.length === 0 ? null : (
        <ul aria-label={`Comments from the ${assignment.boardName}`} className="space-y-2 pl-4">
          {assignment.comments.map((c) => (
            <li key={c.id}>
              <p className="m-0 whitespace-pre-line">{c.body}</p>
              <p className="m-0 text-sm text-muted-foreground">
                {`${c.attribution}, ${formatInstant(c.createdAt, zone)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function BoardComments({
  applicationId,
  assignments,
  choices,
  canManage,
  zone,
}: {
  applicationId: string
  assignments: ApplicationBoardAssignment[]
  choices: { id: string; name: string }[]
  canManage: boolean
  zone: string
}) {
  const offered = offeredBoards(assignments, choices)
  return (
    <>
      {assignments.length === 0 ? null : (
        <>
          <h3>Boards asked for comment</h3>
          <ul className="list-none p-0">
            {assignments.map((a) => (
              <BoardAssignmentItem
                key={a.assignmentId}
                assignment={a}
                canManage={canManage}
                zone={zone}
              />
            ))}
          </ul>
        </>
      )}
      {canManage && offered.length > 0 ? (
        <details>
          <summary>Send to a board for comment</summary>
          <SendToBoardForm applicationId={applicationId} offered={offered} />
        </details>
      ) : null}
    </>
  )
}
