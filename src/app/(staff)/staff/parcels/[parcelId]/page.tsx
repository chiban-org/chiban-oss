import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RecordLayout } from '@/components/layout/RecordLayout'
import type { RawSearchParams } from '@/features/dataTable/params'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { requireStaffContext } from '@/server/requireStaff'
import { FieldParcel } from './FieldParcel'
import { officePanels } from './officePanels'
import { ParcelHeader } from './ParcelHeader'
import { ParcelRail, ParcelStrip } from './ParcelRail'
import { loadParcelPage, NO_MAP_LOT_ID } from './parcelPageData'

interface ParcelPageProps {
  params: Promise<{ parcelId: string }>
  searchParams: Promise<RawSearchParams>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: ParcelPageProps): Promise<Metadata> {
  const { parcelId } = await params
  if (!UUID.test(parcelId)) return { title: 'Parcel' }
  const ctx = await requireStaffContext()
  const result = await getStaffParcelView(ctx.db, ctx.actor, parcelId, new Date(), ctx.signal)
  if (!result.ok) return { title: 'Parcel' }
  const id = result.value.aliases.find((a) => a.status === 'active')?.value ?? NO_MAP_LOT_ID
  return { title: `Parcel ${id}` }
}

export default async function StaffParcelPage({ params, searchParams }: ParcelPageProps) {
  const { parcelId } = await params
  if (!UUID.test(parcelId)) notFound()
  const ctx = await requireStaffContext()
  const data = await loadParcelPage(ctx, parcelId, await searchParams)
  if (data === null) notFound()
  if (data.viewer.page === 'field') {
    return (
      <main data-parcel-view="field">
        <ParcelHeader data={data} />
        <FieldParcel data={data} />
      </main>
    )
  }
  const parts = officePanels(data)
  return (
    <main data-parcel-view="office">
      <ParcelHeader data={data} summaryOnPhones={false} />
      <RecordLayout
        rail={<ParcelRail data={data} />}
        strip={<ParcelStrip data={data} />}
        history={parts.history}
        empty={parts.empty}
      >
        {parts.filled}
      </RecordLayout>
    </main>
  )
}
