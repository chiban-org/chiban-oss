import Link from 'next/link'
import type { ReactNode } from 'react'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import { CorrectPermitDialog } from '@/components/permits/CorrectPermitDialog'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { WorkPlan } from '@/features/applications/workPlanTypes'
import { dueNext, otherOverdue } from '@/features/clocks/clockSummary'
import { NOTICE_DEADLINE_LABEL } from '@/features/hearings/labels'
import { lateNotice } from '@/features/hearings/noticeDeadlines'
import type { CorrectionFormData } from '@/features/permits/correction/correctionForm'
import { formatCivilDate } from '@/lib/formatDate'
import { checkCorrectionAction, correctPermitAction } from './correctionActions'
import { MoreActions } from './nextStepCard'

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

function CorrectPermit({ data }: { data: CorrectionFormData | null }) {
  if (data === null) return null
  return (
    <CorrectPermitDialog
      data={data}
      actions={{ check: checkCorrectionAction, save: correctPermitAction }}
    />
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

function LateNotice({ view }: { view: StaffApplicationView }) {
  const late = lateNotice(view.noticeDeadlines)
  return late === null ? null : (
    <span className="block font-semibold text-status-overdue-fg">
      {`${NOTICE_DEADLINE_LABEL} overdue, due ${formatCivilDate(late.dueOn)}`}
    </span>
  )
}

function deadlineFacts(view: StaffApplicationView): Fact[] {
  const clock = dueNext(view.clocks)
  if (clock === null && lateNotice(view.noticeDeadlines) === null) return []
  const more = otherOverdue(view.clocks)
  const value = (
    <>
      <LateNotice view={view} />
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
  correction,
}: {
  view: StaffApplicationView
  plan: WorkPlan
  notice: ReactNode
  correction: CorrectionFormData | null
}) {
  return (
    <div className="rail-card empty:hidden">
      {notice}
      <Deadlines view={view} />
      {view.state === 'issued' ? <PrintLinks applicationId={view.id} /> : null}
      <CorrectPermit data={correction} />
      <MoreActions view={view} moves={plan.terminal} />
    </div>
  )
}

export function ApplicationFacts({
  view,
  legacyNumber,
  responsible,
}: {
  view: StaffApplicationView
  legacyNumber: string | null
  responsible: ReactNode
}) {
  return (
    <section aria-label="Key facts" data-plain className="rail-card space-y-3">
      {responsible}
      <FactList facts={applicationFacts(view, legacyNumber)} stacked />
    </section>
  )
}

export function StatusStrip({
  view,
  plan,
  notice,
  legacyNumber,
  correction,
  responsible,
}: {
  view: StaffApplicationView
  plan: WorkPlan
  notice: ReactNode
  legacyNumber: string | null
  correction: CorrectionFormData | null
  responsible: ReactNode
}) {
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DueNext clock={dueNext(view.clocks)} />
        <LateNotice view={view} />
      </div>
      {notice}
      {view.state === 'issued' ? <PrintLinks applicationId={view.id} /> : null}
      <details>
        <summary className="text-sm">Facts and more actions</summary>
        <div className="flex flex-col gap-4">
          {responsible}
          <FactList facts={applicationFacts(view, legacyNumber)} stacked />
          <MoreActions view={view} moves={plan.terminal} />
          <CorrectPermit data={correction} />
        </div>
      </details>
    </section>
  )
}
