import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { parcels } from '@/db/schema'
import { displayIdsFor } from '@/features/parcels/displayId'
import { loadTownProfile } from '@/features/pdf/documentFrame'
import { listPortalTypes, RETIRED_PARCEL_COPY } from '@/features/portal/drafts'
import { groupPortalTypes } from '@/features/portal/typeGroups'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { ApplySteps } from './ApplySteps'
import { parcelSearch } from './ParcelSearch'
import { TypePicker } from './TypePicker'

export const metadata: Metadata = { title: 'Start an application' }

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center'

function OfficeLine({ officeName, phone }: { officeName: string; phone: string }) {
  if (phone === '') return null
  return <p className="m-0">{`Not sure which one fits? Call the ${officeName} at ${phone}.`}</p>
}

async function TypeStep({ parcelId }: { parcelId: string }) {
  const ctx = await requirePortalContext(`/portal/apply?parcel=${parcelId}`)
  const [types, display, [chosen], profile] = await Promise.all([
    listPortalTypes(ctx.db, ctx.signal),
    displayIdsFor(ctx.db, [parcelId]),
    ctx.db
      .select({ status: parcels.status, siteAddress: parcels.siteAddress })
      .from(parcels)
      .where(eq(parcels.id, parcelId)),
    loadTownProfile(ctx.db, ctx.signal),
  ])
  const where = `${chosen?.siteAddress ?? 'Address not on file'}, parcel ${display.get(parcelId) ?? ''}`
  return (
    <main className="flex flex-col gap-6">
      <ApplySteps current={2} />
      <h1>Choose the kind of application</h1>
      {chosen?.status === 'retired' ? (
        <p role="alert">{RETIRED_PARCEL_COPY}</p>
      ) : (
        <>
          <p className="m-0 text-lg">{where}</p>
          <TypePicker parcelId={parcelId} grouped={groupPortalTypes(types)} />
          <OfficeLine
            officeName={profile?.officeName ?? 'land use office'}
            phone={profile?.phone ?? ''}
          />
        </>
      )}
      <Link href="/portal/apply" className={LINK}>
        Choose a different parcel
      </Link>
    </main>
  )
}

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; parcel?: string }>
}) {
  const { q = '', parcel } = await searchParams
  if (parcel !== undefined && isUuid(parcel)) return await TypeStep({ parcelId: parcel })
  const ctx = await requirePortalContext('/portal/apply')
  return (
    <main className="flex flex-col gap-6">
      <ApplySteps current={1} />
      <h1>Start an application</h1>
      {await parcelSearch(ctx, q)}
    </main>
  )
}
