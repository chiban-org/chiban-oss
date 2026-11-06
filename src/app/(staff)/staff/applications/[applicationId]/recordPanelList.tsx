import { DocumentPanel } from '@/components/documents/DocumentPanel'
import type { Panel } from '@/components/layout/splitPanels'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { AppealsPanel, hasAppeals } from './appealsPanel'
import { CodeEditionPanel, RegionalImpactPanel } from './buildingPanels'
import { FeesPaymentsPanel, feeRowsOf } from './feesPaymentsPanel'
import { InspectionsPanel } from './inspectionsPanel'
import type { RecordPanelsInput } from './panelSet'
import { ConditionsPanel, PartiesPanel } from './panels'
import { mayAddToRecord } from './recordStage'
import { RecordsPanel } from './recordsPanels'

function conditionsEditable(view: StaffApplicationView): boolean {
  return view.permissions.canIssue && mayAddToRecord(view.state) && view.conditionLibrary.length > 0
}

function conditionsOffered(view: StaffApplicationView): boolean {
  return view.conditions.length > 0 || conditionsEditable(view)
}

function regionalEmpty(view: StaffApplicationView): boolean {
  return view.regionalImpact.determination === null && view.regionalImpact.notices.length === 0
}

function moneyPanels({ view, payments, inspections }: RecordPanelsInput): Panel[] {
  const rows = feeRowsOf(view, payments)
  const money = rows.length > 0 || (payments?.entries.length ?? 0) > 0
  return [
    {
      key: 'conditions',
      empty: view.conditions.length === 0,
      node: conditionsOffered(view) ? <ConditionsPanel key="conditions" view={view} /> : null,
    },
    {
      key: 'fees',
      empty: !money,
      node: <FeesPaymentsPanel key="fees" view={view} payments={payments} rows={rows} />,
    },
    {
      key: 'inspections',
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
  ]
}

export function recordPanels(input: RecordPanelsInput): Panel[] {
  const { view, records, hearings } = input
  const graph = hearings?.graph ?? []
  return [
    ...moneyPanels(input),
    {
      key: 'documents',
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
    {
      key: 'parties',
      empty: view.parties.length === 0,
      node: <PartiesPanel key="parties" view={view} />,
    },
    {
      key: 'edition',
      empty: view.codeEdition === null,
      node: <CodeEditionPanel key="edition" view={view} />,
    },
    {
      key: 'regional',
      empty: regionalEmpty(view),
      node: <RegionalImpactPanel key="regional" view={view} />,
    },
    {
      key: 'appeals',
      empty: !hasAppeals(view, graph),
      node:
        hasAppeals(view, graph) || (view.state === 'issued' && view.permissions.canIssue) ? (
          <AppealsPanel key="appeals" view={view} graph={graph} />
        ) : null,
    },
    {
      key: 'records',
      empty: records.snapshots.length === 0 && records.appHolds.length === 0,
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
