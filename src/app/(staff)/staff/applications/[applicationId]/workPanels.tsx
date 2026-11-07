import type { Panel } from '@/components/layout/splitPanels'
import { hearingRequirementsUnmet } from '@/features/applications/boardRequirements'
import { meetingDeadline } from '@/features/applications/meetingDeadline'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { REVIEWS_GATE_KEY } from '@/features/gates/coreGates'
import { ActivityPanel } from './activityPanel'
import { BoardPanel } from './boardPanel'
import { ClocksPanel, noDeadlines } from './clocksPanel'
import { HearingsPanel } from './hearingsPanel'
import { NotesPanel } from './notesPanel'
import type { RecordPanelsInput } from './panelSet'
import { CompletenessPanel, completenessApplies } from './panels'
import { mayAddToRecord, mayAssignReviewers } from './recordStage'
import { ReviewersPanel } from './reviewersPanel'

function reviewRequired(view: StaffApplicationView): boolean {
  return view.gates.some((g) =>
    g.results.some((r) => r.key === REVIEWS_GATE_KEY && r.effective === 'blocked'),
  )
}

function hearingsEmpty(hearings: RecordPanelsInput['hearings']): boolean {
  if (hearings === null) return true
  return (
    hearings.hearings.length === 0 && hearings.decisions.length === 0 && hearings.trc.length === 0
  )
}

export function workPanels(input: RecordPanelsInput): Panel[] {
  const { view, records, board, hearings, notes } = input
  const hosted = input.hosted ?? new Set()
  const deadline = board === null ? null : meetingDeadline(view.clocks, board.board)
  return [
    {
      key: 'reviewers',
      empty: records.reviewers.length === 0,
      node: (
        <ReviewersPanel
          key="reviewers"
          applicationId={view.id}
          reviewers={records.reviewers}
          choices={records.choices}
          canAssign={records.canAssign && mayAssignReviewers(view.state)}
          required={reviewRequired(view)}
          assignElsewhere={hosted.has('assign_reviewer')}
        />
      ),
    },
    {
      key: 'board',
      empty: false,
      node:
        board === null ? null : (
          <BoardPanel
            key="board"
            data={board}
            hearings={hearings?.hearings.map((h) => h.text) ?? []}
            hosted={hosted}
            deadline={deadline}
            voteBlocked={hearingRequirementsUnmet(view)}
          />
        ),
    },
    {
      key: 'hearings',
      empty: hearingsEmpty(hearings),
      node: (
        <HearingsPanel
          key="hearings"
          data={hearings}
          meetingOnBoard={board?.board === 'zba' && board.acceptanceMeetingId !== null}
          deadline={deadline}
        />
      ),
    },
    {
      key: 'completeness',
      empty: true,
      node: completenessApplies(view) ? (
        <CompletenessPanel
          key="completeness"
          view={view}
          formElsewhere={hosted.has('mark_complete')}
        />
      ) : null,
    },
    { key: 'clocks', empty: noDeadlines(view), node: <ClocksPanel key="clocks" view={view} /> },
    {
      key: 'notes',
      empty: notes.notes.length === 0,
      node: (
        <NotesPanel
          key="notes"
          applicationId={view.id}
          notes={notes.notes}
          canAdd={notes.canAdd && mayAddToRecord(view.state)}
          zone={records.zone}
        />
      ),
    },
    {
      key: 'activity',
      empty: notes.activity.length === 0,
      node: <ActivityPanel key="activity" entries={notes.activity} zone={records.zone} />,
    },
  ]
}
