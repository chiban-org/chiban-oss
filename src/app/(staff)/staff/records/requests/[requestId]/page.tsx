import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StageStrip } from '@/components/layout/StageStrip'
import { arrangePanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import { requesterEmailOf } from '@/features/rtk/requesterEmail'
import { REQUESTS_PATH } from '@/features/rtk/requestListParams'
import {
  loadReleaseCandidates,
  loadReleases,
  loadRequestApprovals,
  loadRequestLetters,
} from '@/features/rtk/requestPage'
import { isRequestOpen, requestChipStatus } from '@/features/rtk/requestStatus'
import { rtkRequestView } from '@/features/rtk/requests'
import { requestStages } from '@/features/rtk/stageStrip'
import { planRequestWork } from '@/features/rtk/workPlan'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townTimeZone } from '@/features/town/timeZone'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { ReleaseSection, releasesEmpty } from './ReleaseSection'
import { RequestRail, RequestStrip } from './RequestRail'
import {
  ReleaseFindPanelTool,
  RequestDoThisNow,
  RequestRequirements,
  type WorkData,
} from './RequestWork'
import { LettersSection, ResponseSection } from './ResponseSection'
import { WithholdingsSection } from './WithholdingsSection'

export const metadata: Metadata = { title: 'Right-to-Know request' }

export const dynamic = 'force-dynamic'

const ARRANGEMENT = { lead: ['releases', 'withholdings'], history: ['response', 'letters'] }

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
  const [viewer, today] = await Promise.all([
    loadNavViewer(ctx.db, ctx.actor, ctx.signal),
    townToday(ctx.db, new Date(), ctx.signal),
  ])
  if (!mayOpen(REQUESTS_PATH, viewer)) {
    return <NoPermission title="Right-to-Know requests" action="see Right-to-Know requests" />
  }
  const view = await rtkRequestView(ctx.db, ctx.actor, requestId, today, ctx.signal)
  if (!view.ok) notFound()
  const request = view.value
  const working = isRequestOpen(request)
  const [releases, approvals, candidates, letters, timeZone, canManage, canRedact] =
    await Promise.all([
      loadReleases(ctx.db, requestId),
      loadRequestApprovals(ctx.db, requestId),
      working ? loadReleaseCandidates(ctx.db, ctx.actor, find) : Promise.resolve([]),
      loadRequestLetters(ctx.db, requestId),
      townTimeZone(ctx.db, ctx.signal),
      hasCapability(ctx.db, ctx.actor.userId, 'rtk.manage', ctx.signal),
      hasCapability(ctx.db, ctx.actor.userId, 'redaction.create', ctx.signal),
    ])
  const plan = planRequestWork({
    request: { ...request, withholdings: request.withholdings.length },
    approvals: approvals.map((a) => ({
      releasedIn: a.releasedIn,
      revoked: a.revokedAt !== null,
      redacted: a.role !== 'original',
      cited: a.cited,
    })),
  })
  const data: WorkData = {
    request,
    plan,
    today,
    approvals,
    candidates,
    find: { requestId, find, userId: ctx.actor.userId, timeZone, canRedact },
    canManage,
  }
  const rail = { request, plan, today, canManage }
  const panels = arrangePanels(
    [
      {
        key: 'releases',
        empty: releasesEmpty(releases, approvals),
        node: (
          <ReleaseSection
            key="releases"
            releases={releases}
            approvals={approvals}
            canManage={canManage}
            findTool={<ReleaseFindPanelTool data={data} />}
            timeZone={timeZone}
            requesterEmail={requesterEmailOf(request.requesterContact)}
          />
        ),
      },
      {
        key: 'withholdings',
        empty: request.withholdings.length === 0,
        node: (
          <WithholdingsSection
            key="withholdings"
            request={request}
            working={canManage && working}
          />
        ),
      },
      {
        key: 'response',
        empty: false,
        node:
          request.firstResponseKind === null ? null : (
            <ResponseSection key="response" request={request} />
          ),
      },
      {
        key: 'letters',
        empty: false,
        node: letters.length === 0 ? null : <LettersSection key="letters" letters={letters} />,
      },
    ],
    ARRANGEMENT,
  )
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
        summary={
          <div className="flex flex-col gap-3">
            <p data-slot="status-sentence" className="m-0 max-w-[75ch]">
              {plan.sentence}
            </p>
            <StageStrip stages={requestStages(request)} />
          </div>
        }
      />
      <RecordLayout
        rail={<RequestRail data={rail} />}
        strip={<RequestStrip data={rail} />}
        {...(panels.history === undefined ? {} : { history: panels.history })}
        {...(panels.empty === undefined ? {} : { empty: panels.empty })}
      >
        <RequestDoThisNow data={data} />
        <RequestRequirements plan={plan} />
        {panels.filled}
      </RecordLayout>
    </main>
  )
}
