import { notFound } from 'next/navigation'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { getTownSettings } from '@/features/town/settings'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AppealsSection } from './AppealsSection'
import { CaseStatusForm } from './CaseStatusForm'
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
  if (!mayOpen('/staff/enforcement', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) notFound()
  if (!isUuid(caseId)) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const loaded = await loadCaseDetail(ctx.db, ctx.actor, caseId, today, ctx.signal)
  if (!loaded.ok) notFound()
  const detail = loaded.value
  const can = await loadCan(ctx.db, ctx.actor, ctx.signal)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const { row } = detail.staff
  return (
    <main className="space-y-6">
      <h1>{`Case ${row.number}`}</h1>
      <p className="m-0">{`${row.locationText}. ${CASE_STATUS_LABELS[row.status]}. Opened ${formatCivilDate(row.openedOn)}${row.closedOn === null ? '' : `, closed ${formatCivilDate(row.closedOn)}`}. ${row.isPublic ? 'This case is public.' : 'This case is private to town staff.'}`}</p>
      {detail.banner === null ? null : (
        <p role="status" className="m-0 rounded-md bg-highlight p-3 font-semibold">
          {detail.banner}
        </p>
      )}
      {can.manage ? <CaseStatusForm detail={detail} /> : null}
      <ComplaintsSection detail={detail} can={can} />
      <NotesSection detail={detail} can={can} />
      <FindingsSection detail={detail} can={can} />
      <OrdersSection detail={detail} can={can} />
      <AppealsSection detail={detail} can={can} />
      <MoneySection detail={detail} can={can} />
      <CounselSection detail={detail} can={can} />
      <DocumentsSection
        detail={detail}
        can={can}
        zone={town.ok ? town.value.timeZone : 'America/New_York'}
      />
    </main>
  )
}
