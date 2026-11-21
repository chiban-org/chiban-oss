import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { SeePublicLink } from '@/components/SeePublicLink'
import { StatusChip } from '@/components/StatusChip'
import { retiredText } from '@/features/parcels/parcelText'
import { parcelPublicHref } from '@/features/publicSite/publicHref'
import { formatCivilDate } from '@/lib/formatDate'
import type { ParcelPageData } from './parcelPageData'

export const NO_SITE_ADDRESS = 'No site address on file'

export function ParcelHeader({
  data,
  summaryOnPhones = true,
}: {
  data: ParcelPageData
  summaryOnPhones?: boolean
}) {
  const { view, siteAddress, displayId } = data
  return (
    <PageHeader
      kicker="Parcel"
      title={siteAddress ?? displayId}
      status={
        view.status === 'retired' ? (
          <StatusChip status="neutral" label={retiredText(view.retiredOn)} />
        ) : undefined
      }
      lead={siteAddress === null ? NO_SITE_ADDRESS : undefined}
      summary={
        <>
          <p data-slot="open-now" className={summaryOnPhones ? 'm-0' : 'm-0 max-lg:hidden'}>
            {data.sentence}
          </p>
          {data.hold === null ? null : (
            <p role="status" className="m-0">
              {`Enforcement hold placed ${formatCivilDate(data.hold.placedOn)} under case `}
              <Link href={`/staff/enforcement/${data.hold.caseId}`}>{data.hold.caseNumber}</Link>
              {'. New applications and permit issuance are refused until it is released.'}
            </p>
          )}
        </>
      }
      facts={siteAddress === null ? [] : [{ label: 'Map-lot ID', value: displayId }]}
      actions={<SeePublicLink href={parcelPublicHref(data.parcelId)} />}
    />
  )
}
