import Link from 'next/link'
import { FactList } from '@/components/layout/PageHeader'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { duePhrase } from '@/features/enforcement/workPlan'
import type { CaseWorkPlan } from '@/features/enforcement/workPlanTypes'
import { formatCivilDate } from '@/lib/formatDate'
import { CaseAssignee, type CaseAssigneeData } from './CaseAssignee'
import { CaseParcel } from './CaseParcel'
import { CaseMoreActions } from './CaseStatusForm'
import { CaseVisibility } from './CaseVisibility'
import type { Can } from './can'

export interface CaseRailProps {
  detail: CaseDetail
  can: Can
  assignee: CaseAssigneeData
  plan: CaseWorkPlan
}

function caseFacts(detail: CaseDetail) {
  const { row } = detail.staff
  return [
    {
      label: 'Parcel',
      value:
        row.parcelId === null ? (
          'Not linked'
        ) : (
          <Link href={`/staff/parcels/${row.parcelId}`}>Open the linked parcel</Link>
        ),
    },
    { label: 'Opened', value: formatCivilDate(row.openedOn) },
    ...(row.closedOn === null ? [] : [{ label: 'Closed', value: formatCivilDate(row.closedOn) }]),
    ...(row.closureReason === null || row.closureReason === ''
      ? []
      : [{ label: 'Reason for closing', value: row.closureReason }]),
  ]
}

function FactsBody({ detail, can }: { detail: CaseDetail; can: Can }) {
  return (
    <>
      <FactList facts={caseFacts(detail)} stacked />
      <CaseParcel detail={detail} can={can} />
      <CaseVisibility detail={detail} can={can} />
    </>
  )
}

export function CaseFacts({ detail, can, assignee }: Omit<CaseRailProps, 'plan'>) {
  return (
    <div className="flex flex-col gap-4">
      <CaseAssignee
        caseId={detail.staff.row.id}
        data={assignee}
        canManage={can.manage}
        card={false}
      />
      <FactsBody detail={detail} can={can} />
    </div>
  )
}

export function FactsAndActions(props: CaseRailProps) {
  return (
    <div className="flex flex-col gap-4">
      <CaseFacts detail={props.detail} can={props.can} assignee={props.assignee} />
      <CaseMoreActions detail={props.detail} moves={props.plan.moves} />
    </div>
  )
}

export function CaseRail({ detail, can, assignee, plan }: CaseRailProps) {
  return (
    <>
      {plan.moves.length === 0 ? null : (
        <div className="rail-card">
          <CaseMoreActions detail={detail} moves={plan.moves} />
        </div>
      )}
      <CaseAssignee caseId={detail.staff.row.id} data={assignee} canManage={can.manage} />
      <div className="rail-card">
        <FactsBody detail={detail} can={can} />
      </div>
    </>
  )
}

export function CaseDue({ plan }: { plan: CaseWorkPlan }) {
  if (plan.due === null) return null
  const late = plan.due.daysLeft < 0
  return (
    <p data-slot="case-due" className={late ? 'attention font-semibold' : undefined}>
      {duePhrase(plan.due)}
    </p>
  )
}

export function CaseStrip(props: CaseRailProps) {
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <CaseDue plan={props.plan} />
      <details>
        <summary className="text-sm">Facts and more actions</summary>
        <FactsAndActions {...props} />
      </details>
    </section>
  )
}
