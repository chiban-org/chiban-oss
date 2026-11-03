import Link from 'next/link'
import type { ReactNode } from 'react'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { formatCivilDate } from '@/lib/formatDate'
import { TransitionBar } from './panels'

function PrintLinks({ applicationId }: { applicationId: string }) {
  return (
    <p className="flex flex-col gap-1">
      <Link href={`/staff/applications/${applicationId}/permit.pdf`}>Print permit</Link>
      <Link href={`/staff/applications/${applicationId}/placard.pdf`}>Print placard</Link>
    </p>
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
  legacyNumber,
}: {
  view: StaffApplicationView
  notice: ReactNode
  legacyNumber: string | null
}) {
  const printable = view.state === 'issued'
  return (
    <>
      <div className="rail-card empty:hidden">
        {notice}
        <TransitionBar view={view} />
        {printable ? <PrintLinks applicationId={view.id} /> : null}
      </div>
      <div className="rail-card">
        <FactList facts={applicationFacts(view, legacyNumber)} stacked />
      </div>
    </>
  )
}
