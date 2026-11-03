import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StatusChip } from '@/components/StatusChip'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { NoPermission } from '@/components/staff/NoPermission'
import { cutoverRows } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { getLimitedApplicationView } from '@/features/applications/limitedApplicationView'
import {
  getStaffApplicationView,
  type StaffApplicationView,
} from '@/features/applications/staffApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { loadBoardPanel } from '@/features/boards/panelData'
import { overdueCount } from '@/features/clocks/clockSummary'
import type { Status } from '@/features/design/tokens'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { returnedCheckNotices } from '@/features/ledger/balanceNotice'
import { loadApplicationPayments } from '@/features/payments/applicationPayments'
import { requireStaffContext, type StaffContext } from '@/server/requireStaff'
import { ApplicationFacts, ApplicationRail, StatusStrip } from './applicationRail'
import { loadInspectionsPanelData } from './inspectionsPanel'
import { LimitedRecord } from './limitedRecord'
import { applicationPanels } from './panelSet'
import { loadRecordsData } from './recordsData'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  params: Promise<{ applicationId: string }>
}

function headerStatus(view: StaffApplicationView): Status {
  const status = applicationChipStatus(view.state)
  return overdueCount(view.clocks) > 0 && status !== 'failed' ? 'overdue' : status
}

async function limitedPage(ctx: StaffContext, applicationId: string) {
  const view = await getLimitedApplicationView(ctx.db, ctx.actor, applicationId, ctx.signal)
  if (view === null) return <NoPermission title="Application" action="open this application" />
  return <LimitedRecord view={view} />
}

async function loadAll(ctx: StaffContext, applicationId: string) {
  const loading = getStaffApplicationView(ctx.db, ctx.actor, applicationId, new Date(), ctx.signal)
  const [view, records, balanceNotices, payments, inspections, board, hearings, imported] =
    await Promise.all([
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
  }
}

export default async function StaffApplicationPage({ params }: Props) {
  const { applicationId } = await params
  if (!UUID.test(applicationId)) notFound()
  const ctx = await requireStaffContext()
  if (!hasFullRecordAccess(ctx.actor)) return await limitedPage(ctx, applicationId)
  const loaded = await loadAll(ctx, applicationId)
  if (loaded === null) notFound()
  const { view, balanceNotices, legacyNumber } = loaded
  const parts = applicationPanels(loaded)
  const status = (
    <StatusChip
      status={headerStatus(view)}
      label={applicationStatusText(view.state, view.substep, view.substeps)}
    />
  )
  const notice = <BalanceDueNotice notices={balanceNotices} />
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={view.number}
        status={status}
        lead={view.projectTitle}
      />
      <RecordLayout
        rail={<ApplicationRail view={view} notice={notice} />}
        railFooter={<ApplicationFacts view={view} legacyNumber={legacyNumber} />}
        strip={
          <StatusStrip view={view} status={status} notice={notice} legacyNumber={legacyNumber} />
        }
        empty={parts.empty}
      >
        {parts.filled}
      </RecordLayout>
    </main>
  )
}
