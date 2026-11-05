import { ListHeader } from '@/components/layout/ListHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { pickedParcelFor } from '@/features/parcels/parcelPick'
import { loadRostersView, type RostersView } from '@/features/rosters/rosterView'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import {
  AssociationsSection,
  GapsSection,
  NOTICE_CONTACTS_LEAD,
  ParksSection,
  RegionalSection,
  RestrictionsSection,
} from './ContactSections'
import { RecheckInterval } from './RecheckInterval'

export const dynamic = 'force-dynamic'

function DueLine({ view }: { view: RostersView }) {
  const due = view.dueCount
  return (
    <div className="grid gap-1">
      {due === 0 ? null : (
        <p className="m-0">
          <span className="bg-highlight px-1 font-semibold">{`${due} due for a check.`}</span>
        </p>
      )}
      <RecheckInterval days={view.recheckDays} canEdit={view.canEditSettings} />
      <p className="m-0 text-sm text-muted-foreground">
        Lists still issue and print an entry past the interval as out of date.
      </p>
    </div>
  )
}

async function prefilledParcel(
  params: Record<string, string | string[] | undefined>,
  ctx: Awaited<ReturnType<typeof requireStaffContext>>,
) {
  const parcel = typeof params.parcel === 'string' ? params.parcel : ''
  if (params.add !== 'association' || !isUuid(parcel)) return null
  return await pickedParcelFor(ctx.db, parcel, ctx.signal)
}

export default async function NoticeContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireStaffContext()
  const view = await loadRostersView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) {
    return <NoPermission title="Notice contacts" action="keep the notice contacts" />
  }
  const prefill = await prefilledParcel(await searchParams, ctx)
  return (
    <main data-wide="">
      <ListHeader title="Notice contacts" lead={NOTICE_CONTACTS_LEAD} />
      <DueLine view={view} />
      <AssociationsSection view={view} prefill={prefill} />
      <GapsSection view={view} />
      <ParksSection view={view} />
      <RestrictionsSection view={view} />
      <RegionalSection view={view} />
    </main>
  )
}
