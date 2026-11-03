import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import type { Status } from '@/features/design/tokens'
import { loadHearingView } from '@/features/hearings/views'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { HearingRail } from './HearingRail'
import { NoticeSection } from './NoticeSection'
import { RecordDecisionSection } from './RecordDecisionSection'

export const dynamic = 'force-dynamic'

const STATUS_CHIP: Record<string, Status> = {
  scheduled: 'neutral',
  held: 'passed',
  continued: 'neutral',
  cancelled: 'neutral',
}

export default async function HearingPage({ params }: { params: Promise<{ hearingId: string }> }) {
  const { hearingId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Hearing" action="work with hearings" />
  }
  if (!isUuid(hearingId)) notFound()
  const view = await loadHearingView(ctx.db, ctx.actor, hearingId, ctx.signal)
  if (view === null) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  return (
    <main>
      <PageHeader
        kicker={`${view.boardName}, ${view.meetingText}`}
        title={`${view.kindText}: ${view.typeLabel} ${view.applicationNumber}`}
        status={
          <StatusChip status={STATUS_CHIP[view.status] ?? 'neutral'} label={view.statusText} />
        }
      />
      <RecordLayout rail={<HearingRail view={view} today={today} />}>
        <NoticeSection view={view} today={today} />
        {view.status === 'held' && view.decision === null ? (
          <RecordDecisionSection view={view} today={today} />
        ) : null}
      </RecordLayout>
    </main>
  )
}
