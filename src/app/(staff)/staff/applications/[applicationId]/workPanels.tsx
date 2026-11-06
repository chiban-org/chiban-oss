import { GatePanel } from '@/components/gates/GatePanel'
import type { Panel } from '@/components/layout/splitPanels'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { REVIEWS_GATE_KEY } from '@/features/gates/coreGates'
import { ActivityPanel } from './activityPanel'
import { BoardPanel } from './boardPanel'
import { ClocksPanel, noDeadlines } from './clocksPanel'
import { GateControls } from './gateControls'
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

function GatesPanel({ view }: { view: StaffApplicationView }) {
  return (
    <section aria-label="Gates" id="gates">
      <h2>Gates</h2>
      <GatePanel
        groups={view.gates}
        renderControls={(result) => <GateControls view={view} result={result} />}
      />
    </section>
  )
}

function hearingsEmpty(hearings: RecordPanelsInput['hearings']): boolean {
  if (hearings === null) return true
  return (
    hearings.hearings.length === 0 && hearings.decisions.length === 0 && hearings.trc.length === 0
  )
}

export function workPanels({ view, records, board, hearings, notes }: RecordPanelsInput): Panel[] {
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
          />
        ),
    },
    {
      key: 'hearings',
      empty: hearingsEmpty(hearings),
      node: <HearingsPanel key="hearings" data={hearings} />,
    },
    {
      key: 'completeness',
      empty: true,
      node: completenessApplies(view) ? <CompletenessPanel key="completeness" view={view} /> : null,
    },
    { key: 'clocks', empty: noDeadlines(view), node: <ClocksPanel key="clocks" view={view} /> },
    {
      key: 'gates',
      empty: view.gates.every((g) => g.results.length === 0),
      node: view.nextTransitions.length === 0 ? null : <GatesPanel key="gates" view={view} />,
    },
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
