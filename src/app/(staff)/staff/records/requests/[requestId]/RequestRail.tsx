import { consequenceText, DueRule } from '@/components/enforcement/DueLine'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { RTK_VIA_LABELS, responseLabel } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'
import { duePhrase } from '@/features/rtk/workPlan'
import type { RequestWorkPlan } from '@/features/rtk/workPlanTypes'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { RequestMoreActions } from './CloseForms'

export interface RailData {
  request: RtkRequestView
  plan: RequestWorkPlan
  today: CivilDate
  canManage: boolean
}

function liveClock(request: RtkRequestView): SubjectDue | null {
  if (request.status === 'open') return request.responseDue
  return request.status === 'awaiting_decision' ? request.statedDue : null
}

function responseFact(request: RtkRequestView): Fact[] {
  const label = responseLabel(request.firstResponseKind)
  if (label === null) return []
  const on = request.firstResponseOn === null ? '' : `, ${formatCivilDate(request.firstResponseOn)}`
  return [{ label: 'First response', value: `${label}${on}` }]
}

function requestFacts(request: RtkRequestView): Fact[] {
  return [
    {
      label: 'Received',
      value: `${formatCivilDate(request.receivedOn)}, ${RTK_VIA_LABELS[request.receivedVia].toLowerCase()}`,
    },
    ...(request.requesterName === null
      ? []
      : [{ label: 'Requester', value: request.requesterName }]),
    ...(request.requesterContact === null
      ? []
      : [{ label: 'Contact', value: request.requesterContact }]),
    ...responseFact(request),
    ...(request.deniedOn === null
      ? []
      : [{ label: 'Denied', value: formatCivilDate(request.deniedOn) }]),
  ]
}

export function DueText({ plan }: { plan: RequestWorkPlan }) {
  if (plan.due === null) return null
  const late = plan.due.daysLeft < 0
  return (
    <p data-slot="request-due" className={late ? 'm-0 attention font-semibold' : 'm-0'}>
      {duePhrase(plan.due)}
    </p>
  )
}

function HowCounted({ due, today }: { due: SubjectDue; today: CivilDate }) {
  const start = START_EVENT_LABELS[due.startEvent] ?? 'Start'
  return (
    <details>
      <summary className="text-sm">How it is counted</summary>
      <div className="flex flex-col gap-1 text-sm">
        <p className="m-0">{`Starts: ${start}, ${formatCivilDate(due.startDate)}. ${humanizeIsoDates(due.countingMethod)}`}</p>
        <p className="m-0">{consequenceText(due, today)}</p>
      </div>
    </details>
  )
}

function DueNext({ data }: { data: RailData }) {
  const clock = liveClock(data.request)
  if (clock === null || data.plan.due === null) return null
  return (
    <section aria-label="Due next" data-plain className="rail-card flex flex-col gap-2">
      <h2 className="m-0 font-sans text-sm font-semibold text-muted-foreground">Due next</h2>
      <DueText plan={data.plan} />
      <DueRule due={clock} />
      <HowCounted due={clock} today={data.today} />
    </section>
  )
}

function closeInCard(data: RailData): boolean {
  return data.plan.now?.kind === 'close'
}

export function RequestRail({ data }: { data: RailData }) {
  const actions = data.canManage && data.plan.now !== null && !closeInCard(data)
  return (
    <>
      <DueNext data={data} />
      {actions ? (
        <div className="rail-card">
          <RequestMoreActions request={data.request} />
        </div>
      ) : null}
      <section aria-label="Key facts" data-plain className="rail-card">
        <FactList facts={requestFacts(data.request)} stacked />
      </section>
    </>
  )
}

export function RequestStrip({ data }: { data: RailData }) {
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <DueText plan={data.plan} />
      <details>
        <summary className="text-sm">Facts and more actions</summary>
        <div className="flex flex-col gap-4">
          <FactList facts={requestFacts(data.request)} stacked />
          {data.canManage && !closeInCard(data) ? (
            <RequestMoreActions request={data.request} />
          ) : null}
        </div>
      </details>
    </section>
  )
}
