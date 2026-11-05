import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { GatePanel } from '@/components/gates/GatePanel'
import { type Panel, splitPanels } from '@/components/layout/splitPanels'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { TERMINAL_STATES } from '@/features/applications/states'
import type { BoardPanelData } from '@/features/boards/panelData'
import { REVIEWS_GATE_KEY } from '@/features/gates/coreGates'
import type { ApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { AppealsPanel, hasAppeals } from './appealsPanel'
import { BoardPanel } from './boardPanel'
import { CodeEditionPanel, RegionalImpactPanel } from './buildingPanels'
import { ClocksPanel, noDeadlines } from './clocksPanel'
import { FeesPaymentsPanel, feeRowsOf } from './feesPaymentsPanel'
import { GateControls } from './gateControls'
import { HearingsPanel } from './hearingsPanel'
import { InspectionsPanel, type InspectionsPanelData } from './inspectionsPanel'
import { CompletenessPanel, ConditionsPanel, completenessApplies, PartiesPanel } from './panels'
import type { loadRecordsData } from './recordsData'
import { RecordsPanel } from './recordsPanels'
import { ReviewersPanel } from './reviewersPanel'

export interface RecordPanelsInput {
  view: StaffApplicationView
  records: Awaited<ReturnType<typeof loadRecordsData>>
  payments: ApplicationPayments | null
  inspections: InspectionsPanelData
  board: BoardPanelData | null
  hearings: ApplicationHearingsPanel | null
}

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

function workPanels({ view, records, board, hearings }: RecordPanelsInput): Panel[] {
  const required = reviewRequired(view)
  return [
    {
      empty: records.reviewers.length === 0 && !required,
      node: (
        <ReviewersPanel
          key="reviewers"
          applicationId={view.id}
          reviewers={records.reviewers}
          choices={records.choices}
          canAssign={records.canAssign && !TERMINAL_STATES.includes(view.state)}
          required={required}
        />
      ),
    },
    {
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
    { empty: false, node: <HearingsPanel key="hearings" data={hearings} /> },
    {
      empty: false,
      node: completenessApplies(view) ? <CompletenessPanel key="completeness" view={view} /> : null,
    },
    { empty: noDeadlines(view), node: <ClocksPanel key="clocks" view={view} /> },
    {
      empty: view.gates.every((g) => g.results.length === 0),
      node: view.nextTransitions.length === 0 ? null : <GatesPanel key="gates" view={view} />,
    },
  ]
}

function conditionsOffered(view: StaffApplicationView): boolean {
  const editable = view.permissions.canIssue && !TERMINAL_STATES.includes(view.state)
  return view.conditions.length > 0 || (editable && view.conditionLibrary.length > 0)
}

function recordPanels(input: RecordPanelsInput): Panel[] {
  const { view, records, payments, inspections, hearings } = input
  const graph = hearings?.graph ?? []
  const rows = feeRowsOf(view, payments)
  const money = rows.length > 0 || (payments?.entries.length ?? 0) > 0
  return [
    {
      empty: view.conditions.length === 0,
      node: conditionsOffered(view) ? <ConditionsPanel key="conditions" view={view} /> : null,
    },
    {
      empty: !money,
      node: <FeesPaymentsPanel key="fees" view={view} payments={payments} rows={rows} />,
    },
    {
      empty: inspections.history.length === 0,
      node:
        inspections.history.length === 0 && !inspections.takesRequests ? null : (
          <InspectionsPanel
            key="inspections"
            data={inspections}
            applicationId={view.id}
            number={view.number}
          />
        ),
    },
    {
      empty: records.documents.length === 0,
      node: (
        <DocumentPanel
          key="documents"
          documents={records.documents}
          canPublish={records.canPublish}
          canManage={records.canManageDocuments}
          actions={PANEL_ACTIONS}
          target={{ kind: 'application', id: view.id }}
        />
      ),
    },
    { empty: view.parties.length === 0, node: <PartiesPanel key="parties" view={view} /> },
    { empty: false, node: <CodeEditionPanel key="edition" view={view} /> },
    { empty: false, node: <RegionalImpactPanel key="regional" view={view} /> },
    {
      empty: !hasAppeals(view, graph),
      node:
        hasAppeals(view, graph) || (view.state === 'issued' && view.permissions.canIssue) ? (
          <AppealsPanel key="appeals" view={view} graph={graph} />
        ) : null,
    },
    {
      empty: false,
      node: (
        <RecordsPanel
          key="records"
          applicationId={view.id}
          projectId={view.projectId}
          snapshots={records.snapshots}
          holds={records.appHolds}
          canHold={records.canHold}
          canManage={records.canManageDocuments}
          buildingRemoval={view.classification === 'nh.building_permit'}
          zone={records.zone}
        />
      ),
    },
  ]
}

export function applicationPanels(input: RecordPanelsInput) {
  return splitPanels([...workPanels(input), ...recordPanels(input)])
}
