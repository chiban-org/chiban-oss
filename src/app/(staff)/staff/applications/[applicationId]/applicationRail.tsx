import Link from 'next/link'
import type { ReactNode } from 'react'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { dueNext, otherOverdue } from '@/features/clocks/clockSummary'
import { formatCivilDate } from '@/lib/formatDate'
import { LeadStatus, MoreActions, NextStepCard, PrimaryMove, type RailPlan } from './nextStepCard'

function PrintLinks({ applicationId }: { applicationId: string }) {
  return (
    <p className="flex flex-col gap-1">
      <Link {...NEW_TAB} href={`/staff/applications/${applicationId}/permit.pdf`}>
        Print permit
      </Link>
      <Link {...NEW_TAB} href={`/staff/applications/${applicationId}/placard.pdf`}>
        Print placard
      </Link>
    </p>
  )
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

type Clock = StaffApplicationView['clocks'][number]

function DueNext({ clock }: { clock: Clock | null }) {
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
  const clock = dueNext(view.clocks)
  if (clock === null) return []
  const more = otherOverdue(view.clocks)
  const value = (
    <>
      <DueNext clock={clock} />
      {more === 0 ? null : (
        <span className="block font-semibold text-status-overdue-fg">{`${more} more overdue`}</span>
      )}
    </>
  )
  return [{ label: 'Due next', value }]
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
  plan,
  notice,
}: {
  view: StaffApplicationView
  plan: RailPlan
  notice: ReactNode
}) {
  return (
    <div className="rail-card empty:hidden">
      {notice}
      <Deadlines view={view} />
      <NextStepCard view={view} plan={plan} />
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
  plan,
  status,
  notice,
  legacyNumber,
}: {
  view: StaffApplicationView
  plan: RailPlan
  status: ReactNode
  notice: ReactNode
  legacyNumber: string | null
}) {
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {status}
        <DueNext clock={dueNext(view.clocks)} />
      </div>
      {notice}
      <PrimaryMove view={view} plan={plan} />
      <LeadStatus plan={plan} />
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
