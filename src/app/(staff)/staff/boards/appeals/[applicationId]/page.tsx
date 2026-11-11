import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppealGraph } from '@/components/appeals/AppealGraph'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadApplicationAppeals } from '@/features/appeals/adminAppeals'
import { hasCapability } from '@/features/authz/capabilities'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AppealSteps } from './AppealSteps'

export const metadata: Metadata = { title: 'Appeal of an administrative decision' }

export const dynamic = 'force-dynamic'

export default async function ApplicationAppealsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const { applicationId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Appeals" action="work with appeals" />
  }
  if (!isUuid(applicationId)) notFound()
  const view = await loadApplicationAppeals(ctx.db, ctx.actor, applicationId, ctx.signal)
  if (view === null) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  return (
    <main>
      <PageHeader
        kicker={<Link href="/staff/boards/appeals">Appeals of administrative decisions</Link>}
        title={view.applicationNumber}
        lead={view.typeLabel}
        actions={
          <Link href={`/staff/applications/${view.applicationId}`}>Open the application</Link>
        }
      />
      <section aria-labelledby="appeals">
        <h2 id="appeals">Decisions and appeals</h2>
        <AppealGraph nodes={view.graph} />
        {view.nodeChoices.length === 0 ? null : (
          <details open={view.graph.length === 1}>
            <summary>Record an appeal step</summary>
            <AppealSteps nodeChoices={view.nodeChoices} today={today} />
          </details>
        )}
      </section>
    </main>
  )
}
