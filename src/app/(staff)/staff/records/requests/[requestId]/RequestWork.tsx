import { DoThisNowCard, RequirementItem, RequirementsPanel } from '@/components/layout/WorkPlan'
import type { ReleaseCandidate, RequestApproval } from '@/features/rtk/requestPage'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { RequestWorkPlan } from '@/features/rtk/workPlanTypes'
import type { CivilDate } from '@/types/civilDate'
import { CloseStepForm } from './CloseForms'
import { DenyStep } from './DenyStep'
import { FirstResponseForm } from './FirstResponseForm'
import { PendingRelease } from './PendingRelease'
import { type FindContext, ReleaseFind } from './ReleaseFind'

export interface WorkData {
  request: RtkRequestView
  plan: RequestWorkPlan
  today: CivilDate
  approvals: readonly RequestApproval[]
  candidates: readonly ReleaseCandidate[]
  find: FindContext
  canManage: boolean
}

export function pendingApprovals(approvals: readonly RequestApproval[]): RequestApproval[] {
  return approvals.filter((a) => a.revokedAt === null && a.releasedIn === null)
}

function searched(data: WorkData): boolean {
  return data.find.find.trim() !== ''
}

function ReleaseStep({ data }: { data: WorkData }) {
  const pending = pendingApprovals(data.approvals)
  const find = <ReleaseFind context={data.find} candidates={data.candidates} />
  return (
    <>
      <PendingRelease
        requestId={data.request.id}
        pending={pending}
        today={data.today}
        timeZone={data.find.timeZone}
      />
      {pending.length === 0 ? (
        find
      ) : (
        <details open={searched(data)}>
          <summary>Approve another record</summary>
          {find}
        </details>
      )}
      <DenyStep request={data.request} today={data.today} />
    </>
  )
}

export function RequestDoThisNow({ data }: { data: WorkData }) {
  const now = data.plan.now
  if (now === null || !data.canManage) return null
  return (
    <DoThisNowCard task={now.task} note={now.note} warnings={now.warnings}>
      {now.kind === 'respond' ? (
        <FirstResponseForm
          requestId={data.request.id}
          today={data.today}
          canDeny={data.request.withholdings.length > 0}
          startOnRelease={searched(data) || pendingApprovals(data.approvals).length > 0}
          releaseStep={<ReleaseStep data={data} />}
        />
      ) : null}
      {now.kind === 'release' ? <ReleaseStep data={data} /> : null}
      {now.kind === 'close' ? <CloseStepForm request={data.request} /> : null}
    </DoThisNowCard>
  )
}

export function ReleaseFindPanelTool({ data }: { data: WorkData }) {
  if (!data.canManage || data.plan.now?.kind !== 'close') return null
  return (
    <details open={searched(data)}>
      <summary>Approve a record for release</summary>
      <ReleaseFind context={data.find} candidates={data.candidates} />
    </details>
  )
}

export function RequestRequirements({ plan }: { plan: RequestWorkPlan }) {
  return (
    <RequirementsPanel
      groups={plan.groups.map((g) => ({
        key: g.key,
        title: g.title,
        items: g.items.map((i) => (
          <RequirementItem
            key={i.key}
            done={i.done}
            label={i.label}
            anchor={i.anchor}
            detail={i.detail}
          />
        )),
      }))}
    />
  )
}
