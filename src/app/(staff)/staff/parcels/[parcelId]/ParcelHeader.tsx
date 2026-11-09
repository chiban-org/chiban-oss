import { PageHeader } from '@/components/layout/PageHeader'
import { SeePublicLink } from '@/components/SeePublicLink'
import { StatusChip } from '@/components/StatusChip'
import { retiredText } from '@/features/parcels/parcelText'
import { parcelPublicHref } from '@/features/publicSite/publicHref'
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
        <p data-slot="open-now" className={summaryOnPhones ? 'm-0' : 'm-0 max-lg:hidden'}>
          {data.sentence}
        </p>
      }
      facts={siteAddress === null ? [] : [{ label: 'Map-lot ID', value: displayId }]}
      actions={<SeePublicLink href={parcelPublicHref(data.parcelId)} />}
    />
  )
}
