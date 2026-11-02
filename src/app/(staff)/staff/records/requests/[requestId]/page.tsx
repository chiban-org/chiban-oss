import { notFound } from 'next/navigation'
import { DueLine } from '@/components/enforcement/DueLine'
import { RTK_STATUS_LABELS, RTK_VIA_LABELS } from '@/features/rtk/labels'
import {
  loadReleaseCandidates,
  loadReleases,
  loadRequestApprovals,
  loadRequestLetters,
} from '@/features/rtk/requestPage'
import { rtkRequestView } from '@/features/rtk/requests'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { ReleaseSection } from './ReleaseSection'
import { ResponseSection } from './ResponseSection'

export const dynamic = 'force-dynamic'

function timelinessText(kind: string, dueOn: string, respondedOn: string | null): string | null {
  if (kind === 'responded_late') {
    return `Responded late: due ${formatCivilDate(dueOn)}, answered ${formatCivilDate(respondedOn ?? dueOn)}.`
  }
  if (kind === 'responded_on_time')
    return `Answered on time, ${formatCivilDate(respondedOn ?? dueOn)}.`
  return null
}

export default async function RequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params
  if (!isUuid(requestId)) notFound()
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const view = await rtkRequestView(ctx.db, ctx.actor, requestId, today, ctx.signal)
  if (!view.ok) notFound()
  const request = view.value
  const [releases, approvals, candidates, letters] = await Promise.all([
    loadReleases(ctx.db, requestId),
    loadRequestApprovals(ctx.db, requestId),
    loadReleaseCandidates(ctx.db, ctx.actor),
    loadRequestLetters(ctx.db, requestId),
  ])
  const late = timelinessText(
    request.timeliness.kind,
    request.timeliness.dueOn,
    'respondedOn' in request.timeliness ? request.timeliness.respondedOn : null,
  )
  return (
    <main className="space-y-6">
      <h1>{`Request ${request.number}`}</h1>
      <p className="m-0">{request.description}</p>
      <p className="m-0">
        {`Received ${formatCivilDate(request.receivedOn)} by ${RTK_VIA_LABELS[request.receivedVia].toLowerCase()}. ${RTK_STATUS_LABELS[request.status]}.`}
      </p>
      {request.requesterName === null && request.requesterContact === null ? null : (
        <p className="m-0">
          {[request.requesterName, request.requesterContact].filter((x) => x !== null).join(', ')}
        </p>
      )}
      <section aria-labelledby="clock" className="space-y-2 border-t pt-4">
        <h2 id="clock">Response deadline</h2>
        <DueLine due={request.responseDue} today={today} />
        {late === null ? null : <p role="status">{late}</p>}
        {request.statedDue === null ? null : (
          <>
            <h3>Date the town stated</h3>
            <DueLine due={request.statedDue} today={today} />
          </>
        )}
      </section>
      <ResponseSection request={request} today={today} />
      <ReleaseSection
        request={request}
        releases={releases}
        approvals={approvals}
        candidates={candidates}
        today={today}
      />
      <section aria-labelledby="letters" className="space-y-2 border-t pt-4">
        <h2 id="letters">Letters</h2>
        {letters.length === 0 ? (
          <p>No letters yet.</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0">
            {letters.map((l) => (
              <li key={l.id}>
                <a href={`/api/documents/${l.id}`} className="text-action underline">
                  {l.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
