import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StatusChip } from '@/components/StatusChip'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { NoPermission } from '@/components/staff/NoPermission'
import { cutoverRows } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { getLimitedApplicationView } from '@/features/applications/limitedApplicationView'
import {
  getStaffApplicationView,
  type StaffApplicationView,
} from '@/features/applications/staffApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { planWork } from '@/features/applications/workPlan'
import { hostedActions } from '@/features/applications/workPlanTypes'
import { loadBoardPanel } from '@/features/boards/panelData'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { returnedCheckNotices } from '@/features/ledger/balanceNotice'
import { loadApplicationPayments } from '@/features/payments/applicationPayments'
import { loadCorrectionForm } from '@/features/permits/correction/correctionForm'
import { requireStaffContext, type StaffContext } from '@/server/requireStaff'
import { ApplicationFacts, ApplicationRail, StatusStrip } from './applicationRail'
import { DoThisNow } from './doThisNow'
import { loadInspectionsPanelData } from './inspectionsPanel'
import { LimitedRecord } from './limitedRecord'
import { loadNotesData } from './notesData'
import { applicationPanels } from './panelSet'
import { abilitiesOf } from './planAbilities'
import { mayAddToRecord } from './recordStage'
import { headerStatus, RecordSummary } from './recordSummary'
import { loadRecordsData } from './recordsData'
import { RequirementsList } from './requirementsList'
import { loadResponsibleData } from './responsibleData'
import { ResponsibleStaff } from './responsibleStaff'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  params: Promise<{ applicationId: string }>
}

async function limitedPage(ctx: StaffContext, applicationId: string) {
  const view = await getLimitedApplicationView(ctx.db, ctx.actor, applicationId, ctx.signal)
  if (view === null) return <NoPermission title="Application" action="open this application" />
  return <LimitedRecord view={view} />
}

async function loadAll(ctx: StaffContext, applicationId: string) {
  const loading = getStaffApplicationView(ctx.db, ctx.actor, applicationId, new Date(), ctx.signal)
  const [
    view,
    records,
    balanceNotices,
    payments,
    inspections,
    board,
    hearings,
    imported,
    correction,
    responsible,
    notes,
  ] = await Promise.all([
    loading,
    loading.then((v) => (v === null ? null : loadRecordsData(ctx, applicationId, v.projectId))),
    returnedCheckNotices(ctx.db, [applicationId], ctx.signal),
    loadApplicationPayments(ctx.db, ctx.actor, applicationId, ctx.signal),
    loadInspectionsPanelData(ctx, applicationId),
    loadBoardPanel(ctx.db, ctx.actor, applicationId, ctx.signal),
    loadApplicationHearingsPanel(ctx.db, ctx.actor, applicationId, ctx.signal),
    ctx.db
      .select({ legacyNumber: cutoverRows.legacyNumber })
      .from(cutoverRows)
      .where(eq(cutoverRows.applicationId, applicationId)),
    loadCorrectionForm(ctx.db, ctx.actor, applicationId, ctx.signal),
    loadResponsibleData(ctx, applicationId),
    loadNotesData(ctx, applicationId),
  ])
  if (view === null || records === null) return null
  return {
    view,
    records,
    balanceNotices,
    payments,
    inspections,
    board,
    hearings,
    legacyNumber: imported[0]?.legacyNumber ?? null,
    correction,
    responsible,
    notes,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { applicationId } = await params
  if (!UUID.test(applicationId)) return { title: 'Application' }
  const ctx = await requireStaffContext()
  const number = hasFullRecordAccess(ctx.actor)
    ? (await getStaffApplicationView(ctx.db, ctx.actor, applicationId, new Date(), ctx.signal))
        ?.number
    : (await getLimitedApplicationView(ctx.db, ctx.actor, applicationId, ctx.signal))?.number
  return { title: number === undefined ? 'Application' : `Application ${number}` }
}

export default async function StaffApplicationPage({ params }: Props) {
  const { applicationId } = await params
  if (!UUID.test(applicationId)) notFound()
  const ctx = await requireStaffContext()
  if (!hasFullRecordAccess(ctx.actor)) return await limitedPage(ctx, applicationId)
  const loaded = await loadAll(ctx, applicationId)
  if (loaded === null) notFound()
  const { view, balanceNotices, legacyNumber, correction } = loaded
  const plan = planWork(view, loaded.board, {
    reviewers: loaded.records.reviewers.length,
    abilities: abilitiesOf(loaded),
    responsible: loaded.responsible.current?.name ?? null,
  })
  const parts = applicationPanels({ ...loaded, hosted: hostedActions(plan) })
  const status = (
    <StatusChip
      status={headerStatus(view)}
      label={applicationStatusText(view.state, view.substep, view.substeps)}
    />
  )
  const notice = <BalanceDueNotice notices={balanceNotices} />
  const responsibleData = {
    ...loaded.responsible,
    canManage: loaded.responsible.canManage && mayAddToRecord(view.state),
  }
  const responsible = <ResponsibleStaff applicationId={view.id} data={responsibleData} />
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={view.number}
        status={status}
        lead={view.projectTitle}
        summary={<RecordSummary view={view} plan={plan} board={loaded.board !== null} />}
      />
      <RecordLayout
        rail={<ApplicationRail view={view} plan={plan} notice={notice} correction={correction} />}
        railFooter={
          <ApplicationFacts view={view} legacyNumber={legacyNumber} responsible={responsible} />
        }
        strip={
          <StatusStrip
            view={view}
            plan={plan}
            notice={notice}
            legacyNumber={legacyNumber}
            correction={correction}
            responsible={responsible}
          />
        }
        empty={parts.empty}
        history={parts.history}
      >
        <DoThisNow plan={plan} input={loaded} />
        <RequirementsList plan={plan} input={loaded} />
        {parts.filled}
      </RecordLayout>
    </main>
  )
}
