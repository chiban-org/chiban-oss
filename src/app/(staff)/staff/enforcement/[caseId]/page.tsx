import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { caseChipStatus } from '@/features/enforcement/chipStatus'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AppealsSection } from './AppealsSection'
import { CaseRail } from './CaseRail'
import { ComplaintsSection } from './ComplaintsSection'
import { CounselSection } from './CounselSection'
import { loadCan } from './can'
import { DocumentsSection } from './DocumentsSection'
import { FindingsSection, NotesSection } from './FindingsSection'
import { MoneySection } from './MoneySection'
import { OrdersSection } from './OrdersSection'

export const dynamic = 'force-dynamic'

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/enforcement', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Code enforcement" action="see code enforcement cases" />
  }
  if (!isUuid(caseId)) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const loaded = await loadCaseDetail(ctx.db, ctx.actor, caseId, today, ctx.signal)
  if (!loaded.ok) notFound()
  const detail = loaded.value
  const can = await loadCan(ctx.db, ctx.actor, ctx.signal)
  const { row } = detail.staff
  const sections = splitPanels([
    {
      empty: detail.staff.complaints.length === 0,
      node: <ComplaintsSection key="complaints" detail={detail} can={can} />,
    },
    {
      empty: detail.staff.notes.length === 0,
      node: <NotesSection key="notes" detail={detail} can={can} />,
    },
    {
      empty: detail.findings.length === 0 && detail.notices.length === 0,
      node: <FindingsSection key="findings" detail={detail} can={can} />,
    },
    {
      empty: detail.orders.length === 0,
      node: <OrdersSection key="orders" detail={detail} can={can} />,
    },
    {
      empty: detail.appeals.length === 0,
      node: <AppealsSection key="appeals" detail={detail} can={can} />,
    },
    {
      empty: detail.fines.length === 0 && detail.exposure === null,
      node: <MoneySection key="money" detail={detail} can={can} />,
    },
    {
      empty: detail.referrals.length === 0,
      node: <CounselSection key="counsel" detail={detail} can={can} />,
    },
    {
      empty: detail.documents.length === 0,
      node: <DocumentsSection key="documents" detail={detail} can={can} />,
    },
  ])
  return (
    <main>
      <PageHeader
        kicker="Code enforcement case"
        title={row.number}
        status={
          <StatusChip status={caseChipStatus(row.status)} label={CASE_STATUS_LABELS[row.status]} />
        }
        lead={row.locationText}
      />
      {detail.banner === null ? null : (
        <p role="status" className="mb-6 rounded-md bg-highlight p-3 font-semibold">
          {detail.banner}
        </p>
      )}
      <RecordLayout rail={<CaseRail detail={detail} can={can} />} empty={sections.empty}>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
