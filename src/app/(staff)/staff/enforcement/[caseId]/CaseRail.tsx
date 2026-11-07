import Link from 'next/link'
import { FactList } from '@/components/layout/PageHeader'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import type { CaseWorkPlan } from '@/features/enforcement/workPlanTypes'
import { formatCivilDate } from '@/lib/formatDate'
import { CaseAssignee, type CaseAssigneeData } from './CaseAssignee'
import { CaseParcel } from './CaseParcel'
import { CaseMoreActions } from './CaseStatusForm'
import type { Can } from './can'

export function CaseRail({
  detail,
  can,
  assignee,
  plan,
}: {
  detail: CaseDetail
  can: Can
  assignee: CaseAssigneeData
  plan: CaseWorkPlan
}) {
  const { row } = detail.staff
  const facts = [
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
    { label: 'Visibility', value: row.isPublic ? 'Public' : 'Private to town staff' },
    ...(row.closureReason === null || row.closureReason === ''
      ? []
      : [{ label: 'Reason for closing', value: row.closureReason }]),
  ]
  return (
    <>
      {plan.moves.length === 0 ? null : (
        <div className="rail-card">
          <CaseMoreActions detail={detail} moves={plan.moves} />
        </div>
      )}
      <CaseAssignee caseId={row.id} data={assignee} canManage={can.manage} />
      <div className="rail-card">
        <FactList facts={facts} stacked />
        <CaseParcel detail={detail} can={can} />
      </div>
    </>
  )
}
