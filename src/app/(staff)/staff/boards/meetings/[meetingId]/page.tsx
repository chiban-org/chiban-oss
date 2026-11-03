import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { loadMeetingView, type MeetingView } from '@/features/hearings/meetingView'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AgendaSection } from './AgendaSection'
import { MeetingRail } from './MeetingRail'

export const dynamic = 'force-dynamic'

function HearingsSection({ view }: { view: MeetingView }) {
  return (
    <section aria-labelledby="hearings">
      <h2 id="hearings">Hearings</h2>
      {view.hearings.length === 0 ? (
        <p>No hearings are scheduled for this meeting.</p>
      ) : (
        <ul className="list-none space-y-2 p-0">
          {view.hearings.map((h) => (
            <li key={h.id}>
              <Link href={`/staff/boards/hearings/${h.id}`}>{h.text}</Link>
              {`. ${h.statusText}.`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function MeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Meeting" action="work with meetings" />
  }
  if (!isUuid(meetingId)) notFound()
  const view = await loadMeetingView(ctx.db, ctx.actor, meetingId, ctx.signal)
  if (view === null) notFound()
  const sections = splitPanels([
    { empty: view.hearings.length === 0, node: <HearingsSection key="hearings" view={view} /> },
    {
      empty: view.agenda === null || view.agenda.items.length === 0,
      node: <AgendaSection key="agenda" view={view} />,
    },
  ])
  return (
    <main>
      <PageHeader
        kicker={<Link href="/staff/boards/meetings">{`${view.boardName} meeting`}</Link>}
        title={view.dateText}
        status={view.cancelled ? <StatusChip status="neutral" label="Cancelled" /> : undefined}
      />
      <RecordLayout rail={<MeetingRail view={view} />} empty={sections.empty}>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
