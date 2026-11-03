import type { BoardPanelData } from '@/features/boards/panelData'

export interface BoardStep {
  label: string
  note: string | null
  linked: boolean
}

function meetingNote(board: BoardPanelData): string | null {
  const upcoming = board.acceptanceDate !== null && board.acceptanceDate > board.today
  return upcoming && board.acceptanceText !== null
    ? `After the meeting on ${board.acceptanceText}.`
    : null
}

export function boardStepFor(board: BoardPanelData | null): BoardStep | null {
  if (board === null || board.state !== 'submitted') return null
  const planning = board.board === 'planning_board'
  if (!board.canRecord) {
    return {
      label: planning
        ? 'The board votes on whether the application is complete.'
        : 'The board decides whether to open the hearing.',
      note: null,
      linked: false,
    }
  }
  if (board.acceptanceMeetingId === null) {
    return {
      label: planning ? 'Set the acceptance meeting' : 'Set the hearing meeting',
      note: null,
      linked: true,
    }
  }
  return {
    label: planning ? 'Record the completeness vote' : 'Open the hearing',
    note: meetingNote(board),
    linked: true,
  }
}

export function BoardStepLine({ step }: { step: BoardStep | null }) {
  if (step === null) return null
  if (!step.linked) return <p className="text-sm">{step.label}</p>
  return (
    <p className="text-sm">
      <a href="#board" className="font-semibold">
        {step.label}
      </a>
      {step.note === null ? null : <span className="block text-ink-secondary">{step.note}</span>}
    </p>
  )
}
