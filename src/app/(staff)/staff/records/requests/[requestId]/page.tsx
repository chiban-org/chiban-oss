import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import { REQUESTS_PATH } from '@/features/rtk/requestListParams'
import {
  loadReleaseCandidates,
  loadReleases,
  loadRequestApprovals,
  loadRequestLetters,
  releaseSearchExample,
} from '@/features/rtk/requestPage'
import { isRequestOpen, requestChipStatus } from '@/features/rtk/requestStatus'
import { rtkRequestView } from '@/features/rtk/requests'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { ReleaseSection } from './ReleaseSection'
import { RequestRail } from './RequestRail'
import { ResponseSection } from './ResponseSection'
import { WithholdingsSection } from './WithholdingsSection'

export const metadata: Metadata = { title: 'Right-to-Know request' }

export const dynamic = 'force-dynamic'

function LettersSection({ letters }: { letters: { id: string; title: string }[] }) {
  return (
    <section aria-labelledby="letters">
      <h2 id="letters">Letters</h2>
      {letters.length === 0 ? (
        <p>A letter is created when you record the first response or release the first records.</p>
      ) : (
        <ul className="list-none space-y-1 p-0">
          {letters.map((l) => (
            <li key={l.id}>
              <a {...NEW_TAB} href={`/api/documents/${l.id}`}>
                {l.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>
  searchParams?: Promise<{ find?: string }>
}) {
  const { requestId } = await params
  const find = (await searchParams)?.find ?? ''
  if (!isUuid(requestId)) notFound()
  const ctx = await requireStaffContext()
  if (!mayOpen(REQUESTS_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Right-to-Know requests" action="see Right-to-Know requests" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const view = await rtkRequestView(ctx.db, ctx.actor, requestId, today, ctx.signal)
  if (!view.ok) notFound()
  const request = view.value
  const canManage = true
  const working = isRequestOpen(request)
  const [releases, approvals, candidates, letters, example] = await Promise.all([
    loadReleases(ctx.db, requestId),
    loadRequestApprovals(ctx.db, requestId),
    working ? loadReleaseCandidates(ctx.db, ctx.actor, find) : Promise.resolve([]),
    loadRequestLetters(ctx.db, requestId),
    working ? releaseSearchExample(ctx.db, ctx.actor) : Promise.resolve(null),
  ])
  const sections = splitPanels([
    {
      empty: request.firstResponseKind === null,
      node: <ResponseSection key="response" request={request} today={today} working={working} />,
    },
    {
      empty: request.withholdings.length === 0,
      node: <WithholdingsSection key="withholdings" request={request} working={working} />,
    },
    {
      empty: releases.length === 0 && approvals.length === 0,
      node: (
        <ReleaseSection
          key="releases"
          find={{ requestId, find, userId: ctx.actor.userId, example }}
          releases={releases}
          approvals={approvals}
          candidates={candidates}
          today={today}
          canManage={canManage}
          working={working}
        />
      ),
    },
    { empty: letters.length === 0, node: <LettersSection key="letters" letters={letters} /> },
  ])
  return (
    <main>
      <PageHeader
        kicker="Right-to-Know request"
        title={request.number}
        status={
          <StatusChip
            status={requestChipStatus(request)}
            label={RTK_STATUS_LABELS[request.status]}
          />
        }
        lead={request.description}
      />
      <RecordLayout
        rail={<RequestRail request={request} today={today} canManage={canManage} />}
        empty={sections.empty}
      >
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
