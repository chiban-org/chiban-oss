import { asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { ClockCard } from '@/components/clocks/ClockCard'
import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { FeeTable } from '@/components/fees/FeeTable'
import { GatePanel } from '@/components/gates/GatePanel'
import { StatusChip } from '@/components/StatusChip'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { AreaField, TextField } from '@/components/staff/fields'
import { applicationSnapshots, cutoverRows } from '@/db/schema'
import {
  getStaffApplicationView,
  type StaffApplicationView,
} from '@/features/applications/staffApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { applicationSubtitle } from '@/features/applications/subtitle'
import { hasCapability } from '@/features/authz/capabilities'
import { loadBoardPanel } from '@/features/boards/panelData'
import { loadPanelDocuments } from '@/features/documents/panelData'
import type { FeeComputation } from '@/features/fees/computeFees'
import type { GateResult } from '@/features/gates/evaluateGates'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { returnedCheckNotices } from '@/features/ledger/balanceNotice'
import { loadApplicationPayments } from '@/features/payments/applicationPayments'
import { applicationHolds } from '@/features/records/holds'
import { listApplicationReviewers, listReviewerChoices } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { overrideGateAction, revokeOverrideAction, statutoryExceptionAction } from './actions'
import { BoardPanel } from './boardPanel'
import { AppealPanel, CodeEditionPanel, RegionalImpactPanel } from './buildingPanels'
import { FeeOverrideForm } from './feePanels'
import { HearingsPanel } from './hearingsPanel'
import { InspectionsPanel, loadInspectionsPanelData } from './inspectionsPanel'
import {
  ClockAdjustForm,
  CompletenessPanel,
  ConditionsPanel,
  PartiesPanel,
  TransitionBar,
} from './panels'
import { PaymentsPanel } from './paymentsPanel'
import { loadRecordsData } from './recordsData'
import { RecordsPanel } from './recordsPanels'
import { ReviewersPanel } from './reviewersPanel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  params: Promise<{ applicationId: string }>
}

function PrintLinks({ applicationId }: { applicationId: string }) {
  return (
    <p>
      <Link
        href={`/staff/applications/${applicationId}/permit.pdf`}
        className="text-action underline"
      >
        Print permit
      </Link>{' '}
      <Link
        href={`/staff/applications/${applicationId}/placard.pdf`}
        className="text-action underline"
      >
        Print placard
      </Link>
    </p>
  )
}

function GateControls({ view, result }: { view: StaffApplicationView; result: GateResult }) {
  const { canOverrideGate, canRecordStatutoryException } = view.permissions
  if (result.override !== null) {
    const allowed =
      result.override.kind === 'statutory_exception' ? canRecordStatutoryException : canOverrideGate
    return allowed ? (
      <ActionForm action={revokeOverrideAction} submitLabel="Revoke override">
        <input type="hidden" name="overrideId" value={result.override.id} />
      </ActionForm>
    ) : null
  }
  if (result.effective === 'pass') return null
  if (result.kind === 'administrative' && canOverrideGate) {
    return (
      <details>
        <summary>Override this gate</summary>
        <ActionForm action={overrideGateAction} submitLabel="Override with reason">
          <input type="hidden" name="applicationId" value={view.id} />
          <input type="hidden" name="gateKey" value={result.key} />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      </details>
    )
  }
  if (result.kind === 'statutory' && canRecordStatutoryException) {
    return (
      <details>
        <summary>Record a statutory exception</summary>
        <ActionForm action={statutoryExceptionAction} submitLabel="Record exception">
          <input type="hidden" name="applicationId" value={view.id} />
          <input type="hidden" name="gateKey" value={result.key} />
          <TextField label="Legal authority: citation" name="citation" required />
          <AreaField label="Legal authority: explanation" name="explanation" required />
        </ActionForm>
      </details>
    )
  }
  return null
}

export default async function StaffApplicationPage({ params }: Props) {
  const { applicationId } = await params
  if (!UUID.test(applicationId)) notFound()
  const ctx = await requireStaffContext()
  const view = await getStaffApplicationView(
    ctx.db,
    ctx.actor,
    applicationId,
    new Date(),
    ctx.signal,
  )
  if (view === null) notFound()
  const balanceNotices = await returnedCheckNotices(ctx.db, [applicationId], ctx.signal)
  const payments = await loadApplicationPayments(ctx.db, ctx.actor, applicationId, ctx.signal)
  const records = await loadRecordsData(ctx, applicationId, view.projectId)
  const inspections = await loadInspectionsPanelData(ctx, applicationId)
  const board = await loadBoardPanel(ctx.db, ctx.actor, applicationId, ctx.signal)
  const hearings = await loadApplicationHearingsPanel(ctx.db, ctx.actor, applicationId, ctx.signal)
  const [imported] = await ctx.db
    .select({ legacyNumber: cutoverRows.legacyNumber })
    .from(cutoverRows)
    .where(eq(cutoverRows.applicationId, applicationId))
  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{view.number}</h1>
        <StatusChip
          status={
            view.state === 'issued'
              ? 'passed'
              : view.state === 'suspended'
                ? 'overdue'
                : view.state === 'denied' || view.state === 'expired'
                  ? 'failed'
                  : 'neutral'
          }
          label={applicationStatusText(view.state, view.substep, view.substeps)}
        />
      </div>
      <p className="text-muted-foreground">
        {`${applicationSubtitle(view.typeLabel, view.projectTitle)} on parcel `}
        <Link href={`/staff/parcels/${view.parcelId}`} className="text-action underline">
          {view.parcelDisplayId}
        </Link>
        {view.receivedDate === null
          ? '. Not yet submitted.'
          : `. Received ${formatCivilDate(view.receivedDate)}.`}
        {view.issuedOn === null ? '' : ` Issued ${formatCivilDate(view.issuedOn)}.`}
      </p>
      {imported === undefined ? null : (
        <p>{`Number in the prior system: ${imported.legacyNumber}`}</p>
      )}
      <BalanceDueNotice notices={balanceNotices} />
      <TransitionBar view={view} />
      <ReviewersPanel
        applicationId={view.id}
        reviewers={records.reviewers}
        choices={records.choices}
        canAssign={records.canAssign}
      />
      <PartiesPanel view={view} />
      {board === null ? null : <BoardPanel data={board} />}
      <HearingsPanel data={hearings} />
      <CompletenessPanel view={view} />
      <section aria-label="Clocks">
        <h2>Clocks</h2>
        {view.clocks.length === 0 ? <p>No clock is running on this application.</p> : null}
        {view.clocks.map((clock) => (
          <div key={clock.clockId}>
            <ClockCard clock={clock} />
            {clock.status === 'running' || clock.status === 'overdue' ? (
              <ClockAdjustForm
                view={view}
                clockId={clock.clockId}
                allowedKinds={clock.allowedAdjustments}
              />
            ) : null}
          </div>
        ))}
      </section>
      <section aria-label="Gates">
        <h2>Gates</h2>
        <GatePanel
          groups={view.gates}
          renderControls={(result) => <GateControls view={view} result={result} />}
        />
      </section>
      <ConditionsPanel view={view} />
      <section aria-label="Fees">
        <h2>Fees</h2>
        {view.fees.assessments.map((a) => (
          <FeeTable
            key={a.id}
            title={`Assessed ${a.stage.replaceAll('_', ' ')} (assessment ${a.sequence})`}
            computation={a.computation as FeeComputation}
          />
        ))}
        {view.fees.preview === null ? null : (
          <FeeTable title="Preview of the next assessment" computation={view.fees.preview} />
        )}
        <FeeOverrideForm view={view} />
      </section>
      <PaymentsPanel payments={payments} />
      <InspectionsPanel data={inspections} applicationId={applicationId} number={view.number} />
      <DocumentPanel
        documents={records.documents}
        canPublish={records.canPublish}
        canManage={records.canManageDocuments}
        actions={PANEL_ACTIONS}
        target={{ kind: 'application', id: applicationId }}
      />
      <RecordsPanel
        applicationId={applicationId}
        projectId={view.projectId}
        snapshots={records.snapshots}
        holds={records.appHolds}
        canHold={records.canHold}
        canManage={records.canManageDocuments}
        zone={records.zone}
      />
      {view.state === 'issued' ? <PrintLinks applicationId={view.id} /> : null}
      <CodeEditionPanel view={view} />
      <RegionalImpactPanel view={view} />
      <AppealPanel view={view} />
    </main>
  )
}
