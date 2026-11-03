import { asc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ClockCard } from '@/components/clocks/ClockCard'
import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { FeeTable } from '@/components/fees/FeeTable'
import { GatePanel } from '@/components/gates/GatePanel'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { applicationSnapshots, cutoverRows } from '@/db/schema'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import {
  getStaffApplicationView,
  type StaffApplicationView,
} from '@/features/applications/staffApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { hasCapability } from '@/features/authz/capabilities'
import { loadBoardPanel } from '@/features/boards/panelData'
import { loadPanelDocuments } from '@/features/documents/panelData'
import type { FeeComputation } from '@/features/fees/computeFees'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { returnedCheckNotices } from '@/features/ledger/balanceNotice'
import { loadApplicationPayments } from '@/features/payments/applicationPayments'
import { applicationHolds } from '@/features/records/holds'
import { listApplicationReviewers, listReviewerChoices } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { ApplicationRail } from './applicationRail'
import { BoardPanel } from './boardPanel'
import { AppealPanel, CodeEditionPanel, RegionalImpactPanel } from './buildingPanels'
import { FeeOverrideForm } from './feePanels'
import { GateControls } from './gateControls'
import { HearingsPanel } from './hearingsPanel'
import { InspectionsPanel, loadInspectionsPanelData } from './inspectionsPanel'
import { ClockAdjustForm, CompletenessPanel, ConditionsPanel, PartiesPanel } from './panels'
import { PaymentsPanel } from './paymentsPanel'
import { loadRecordsData } from './recordsData'
import { RecordsPanel } from './recordsPanels'
import { ReviewersPanel } from './reviewersPanel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  params: Promise<{ applicationId: string }>
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
  const parts = splitPanels([
    {
      empty: records.reviewers.length === 0,
      node: (
        <ReviewersPanel
          key="reviewers"
          applicationId={view.id}
          reviewers={records.reviewers}
          choices={records.choices}
          canAssign={records.canAssign}
        />
      ),
    },
    { empty: false, node: board === null ? null : <BoardPanel key="board" data={board} /> },
    { empty: false, node: <HearingsPanel key="hearings" data={hearings} /> },
    {
      empty: false,
      node:
        view.completedDate === null ? <CompletenessPanel key="completeness" view={view} /> : null,
    },
    {
      empty: view.clocks.length === 0,
      node: (
        <section key="clocks" aria-label="Clocks">
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
      ),
    },
    {
      empty: view.gates.length === 0,
      node: (
        <section key="gates" aria-label="Gates">
          <h2>Gates</h2>
          <GatePanel
            groups={view.gates}
            renderControls={(result) => <GateControls view={view} result={result} />}
          />
        </section>
      ),
    },
    { empty: view.conditions.length === 0, node: <ConditionsPanel key="conditions" view={view} /> },
    {
      empty: view.fees.assessments.length === 0 && view.fees.preview === null,
      node: (
        <section key="fees" aria-label="Fees">
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
      ),
    },
    {
      empty:
        payments !== null && payments.balance.lines.length === 0 && payments.entries.length === 0,
      node: <PaymentsPanel key="payments" payments={payments} />,
    },
    {
      empty: inspections.history.length === 0,
      node: (
        <InspectionsPanel
          key="inspections"
          data={inspections}
          applicationId={applicationId}
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
          target={{ kind: 'application', id: applicationId }}
        />
      ),
    },
    { empty: view.parties.length === 0, node: <PartiesPanel key="parties" view={view} /> },
    { empty: false, node: <CodeEditionPanel key="edition" view={view} /> },
    { empty: false, node: <RegionalImpactPanel key="regional" view={view} /> },
    { empty: view.appeals.length === 0, node: <AppealPanel key="appeals" view={view} /> },
    {
      empty: false,
      node: (
        <RecordsPanel
          key="records"
          applicationId={applicationId}
          projectId={view.projectId}
          snapshots={records.snapshots}
          holds={records.appHolds}
          canHold={records.canHold}
          canManage={records.canManageDocuments}
          zone={records.zone}
        />
      ),
    },
  ])
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={view.number}
        status={
          <StatusChip
            status={applicationChipStatus(view.state)}
            label={applicationStatusText(view.state, view.substep, view.substeps)}
          />
        }
        lead={view.projectTitle}
      />
      <RecordLayout
        rail={
          <ApplicationRail
            view={view}
            notice={<BalanceDueNotice notices={balanceNotices} />}
            legacyNumber={imported?.legacyNumber ?? null}
          />
        }
        empty={parts.empty}
      >
        {parts.filled}
      </RecordLayout>
    </main>
  )
}
