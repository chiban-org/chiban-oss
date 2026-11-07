import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StatusChip } from '@/components/StatusChip'
import { applicationStatusText } from '@/features/applications/statusText'
import { inspectorSentence } from '@/features/inspections/inspectorFocus'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { ApplicationFacts, Deadlines, PrintLinks } from './applicationRail'
import type { InspectorWork } from './inspectorData'
import { EarlierInspections, LastResult, NextInspection, OpenRequests } from './inspectorSections'
import { NotesPanel } from './notesPanel'
import type { RecordPanelsInput } from './panelSet'
import { ConditionsPanel, PartiesPanel } from './panels'
import { headerStatus, StageSummary } from './recordSummary'
import { type ResponsibleData, ResponsibleStaff } from './responsibleStaff'

export interface InspectorRecordInput extends RecordPanelsInput {
  legacyNumber: string | null
  responsible: ResponsibleData
}

function PermitFacts({ input }: { input: InspectorRecordInput }) {
  const { view } = input
  const responsible = (
    <ResponsibleStaff applicationId={view.id} data={{ ...input.responsible, canManage: false }} />
  )
  return (
    <details data-permit-facts="" className="record-history">
      <summary>Permit facts</summary>
      <section aria-label="Permit papers" data-plain className="flex flex-col gap-3">
        {view.state === 'issued' ? <PrintLinks applicationId={view.id} /> : null}
        <Deadlines view={view} />
      </section>
      <ApplicationFacts view={view} legacyNumber={input.legacyNumber} responsible={responsible} />
      {view.parties.length === 0 ? null : <PartiesPanel view={view} />}
    </details>
  )
}

export function InspectorRecord({
  input,
  work,
  viewerId,
}: {
  input: InspectorRecordInput
  work: InspectorWork
  viewerId: string
}) {
  const { view, inspections, records, notes } = input
  const sentence = inspectorSentence({
    rows: inspections.history,
    today: view.today,
    viewerId,
    inspectorName: work.inspectorName,
  })
  const sections = { work, data: inspections, number: view.number }
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={view.number}
        status={
          <StatusChip
            status={headerStatus(view)}
            label={applicationStatusText(view.state, view.substep, view.substeps)}
          />
        }
        lead={view.projectTitle}
        summary={<StageSummary view={view} sentence={sentence} board={input.board !== null} />}
      />
      <RecordLayout>
        <NextInspection {...sections} />
        <LastResult {...sections} />
        <OpenRequests {...sections} />
        <ConditionsPanel view={view} />
        {records.documents.length === 0 ? null : (
          <DocumentPanel
            documents={records.documents}
            canPublish={false}
            canManage={false}
            actions={PANEL_ACTIONS}
            target={{ kind: 'application', id: view.id }}
          />
        )}
        {notes.notes.length === 0 ? null : (
          <NotesPanel
            applicationId={view.id}
            notes={notes.notes}
            canAdd={false}
            zone={records.zone}
          />
        )}
        <EarlierInspections {...sections} />
        <PermitFacts input={input} />
      </RecordLayout>
    </main>
  )
}
