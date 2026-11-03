import Link from 'next/link'
import type { ReactNode } from 'react'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { dueNext, overdueCount } from '@/features/clocks/clockSummary'
import { formatCivilDate } from '@/lib/formatDate'
import {
  BlockerList,
  MoreActions,
  MoveForm,
  moveLabel,
  NextStepCard,
  nextStepPlan,
} from './nextStepCard'

function PrintLinks({ applicationId }: { applicationId: string }) {
  return (
    <p className="flex flex-col gap-1">
      <Link href={`/staff/applications/${applicationId}/permit.pdf`}>Print permit</Link>
      <Link href={`/staff/applications/${applicationId}/placard.pdf`}>Print placard</Link>
    </p>
  )
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

export function DueNext({ view }: { view: StaffApplicationView }) {
  const clock = dueNext(view.clocks)
  if (clock === null) return null
  return (
    <span>
      {`${clock.ruleLabel}, ${formatCivilDate(clock.currentDue.value)}, `}
      {clock.daysRemaining < 0 ? (
        <span className="attention font-semibold">{`${days(-clock.daysRemaining)} overdue`}</span>
      ) : (
        `${days(clock.daysRemaining)} left`
      )}
    </span>
  )
}

function deadlineFacts(view: StaffApplicationView): Fact[] {
  const late = overdueCount(view.clocks)
  const next: Fact[] =
    dueNext(view.clocks) === null ? [] : [{ label: 'Due next', value: <DueNext view={view} /> }]
  return late === 0 ? next : [...next, { label: 'Overdue clocks', value: String(late) }]
}

function Deadlines({ view }: { view: StaffApplicationView }) {
  const facts = deadlineFacts(view)
  if (facts.length === 0) return null
  return (
    <section aria-label="Deadlines" data-plain>
      <FactList facts={facts} stacked />
    </section>
  )
}

function applicationFacts(view: StaffApplicationView, legacyNumber: string | null): Fact[] {
  return [
    {
      label: 'Parcel',
      value: <Link href={`/staff/parcels/${view.parcelId}`}>{view.parcelDisplayId}</Link>,
    },
    {
      label: 'Received',
      value: view.receivedDate === null ? 'Not yet submitted' : formatCivilDate(view.receivedDate),
    },
    ...(view.completedDate === null
      ? []
      : [{ label: 'Complete', value: formatCivilDate(view.completedDate) }]),
    ...(view.issuedOn === null ? [] : [{ label: 'Issued', value: formatCivilDate(view.issuedOn) }]),
    ...(legacyNumber === null
      ? []
      : [{ label: 'Number in the prior system', value: legacyNumber }]),
  ]
}

export function ApplicationRail({
  view,
  notice,
}: {
  view: StaffApplicationView
  notice: ReactNode
}) {
  return (
    <div className="rail-card empty:hidden">
      {notice}
      <Deadlines view={view} />
      <NextStepCard view={view} />
      {view.state === 'issued' ? <PrintLinks applicationId={view.id} /> : null}
    </div>
  )
}

export function ApplicationFacts({
  view,
  legacyNumber,
}: {
  view: StaffApplicationView
  legacyNumber: string | null
}) {
  return (
    <section aria-label="Key facts" data-plain className="rail-card">
      <FactList facts={applicationFacts(view, legacyNumber)} stacked />
    </section>
  )
}

export function StatusStrip({
  view,
  status,
  notice,
  legacyNumber,
}: {
  view: StaffApplicationView
  status: ReactNode
  notice: ReactNode
  legacyNumber: string | null
}) {
  const plan = nextStepPlan(view)
  const blocked = plan.lead !== null && plan.lead.blockers.length > 0 ? plan.lead : null
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {status}
        <DueNext view={view} />
      </div>
      {notice}
      {plan.primary === null ? null : (
        <MoveForm
          view={view}
          to={plan.primary}
          label={`Move to ${moveLabel(plan.primary)}`}
          variant="default"
        />
      )}
      {blocked === null ? null : <BlockerList to={blocked.to} blockers={blocked.blockers} />}
      <details>
        <summary className="text-sm">Facts and more actions</summary>
        <div className="flex flex-col gap-4">
          <FactList facts={applicationFacts(view, legacyNumber)} stacked />
          <MoreActions view={view} moves={plan.terminal} />
        </div>
      </details>
    </section>
  )
}
