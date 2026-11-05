import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SectionHeader } from '@/components/layout/ListHeader'
import { StatusChip } from '@/components/StatusChip'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import type { RostersView } from '@/features/rosters/rosterView'
import { AddAssociation } from './AssociationForms'
import { recordLandRecordsCheckAction } from './actions'
import { AssociationTable, ParkTable, RestrictionTable } from './ContactTables'
import { AddHolder } from './HolderForms'
import { AddPark } from './ParkForms'
import { ParcelLink } from './RowParts'

export const NOTICE_CONTACTS_LEAD =
  'People who get mailed notice instead of, or as well as, the parcel owner.'

export const SECTION_LINES = {
  associations: 'Notices for a condo parcel go to the association officers, not the unit owners.',
  parks:
    'Notices go to the park owner. Each tenant is listed and you decide per application whether their home is adjoining or across.',
  restrictions: "When an applicant's land carries one of these, the holder is notified.",
  regional:
    'Used only when an application has regional impact or is within 500 feet under NH DES rules.',
} as const

export function AssociationsSection({
  view,
  prefill,
}: {
  view: RostersView
  prefill: PickedParcel | null
}) {
  return (
    <section aria-labelledby="associations" className="space-y-3">
      <SectionHeader
        id="associations"
        title="Condo associations"
        action={<AddAssociation today={view.today} parcel={prefill} open={prefill !== null} />}
      />
      <p className="m-0">{SECTION_LINES.associations}</p>
      {view.associations.length === 0 ? (
        <p className="m-0">No associations on file. Add one with Add association.</p>
      ) : (
        <AssociationTable rows={view.associations} today={view.today} />
      )}
    </section>
  )
}

export function GapsSection({ view }: { view: RostersView }) {
  if (view.gaps.length === 0) return null
  return (
    <section aria-labelledby="gaps" className="space-y-3">
      <h2 id="gaps" className="m-0">
        Condo parcels with no association on file
      </h2>
      <p className="m-0">
        An abutter list that touches one of these cannot be issued until its association is added.
      </p>
      <ul className="m-0 list-none p-0">
        {view.gaps.map((g) => (
          <li key={g.parcelId} className="record-item flex flex-wrap items-center gap-x-4 gap-y-2">
            <ParcelLink parcelId={g.parcelId} label={g.parcel} />
            <span>{`${g.siteAddress ?? 'Address not on file'}, ${g.units} units`}</span>
            <AddAssociation
              today={view.today}
              parcel={{
                parcelId: g.parcelId,
                displayId: g.parcel,
                status: 'active',
                siteAddress: g.siteAddress,
                ownerName: null,
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ParksSection({ view }: { view: RostersView }) {
  return (
    <section aria-labelledby="parks" className="space-y-3">
      <SectionHeader
        id="parks"
        title="Manufactured housing parks"
        action={<AddPark today={view.today} />}
      />
      <p className="m-0">{SECTION_LINES.parks}</p>
      {view.parks.length === 0 ? (
        <p className="m-0">No parks on file. Add one with Add park.</p>
      ) : (
        <ParkTable rows={view.parks} today={view.today} />
      )}
    </section>
  )
}

export function RestrictionsSection({ view }: { view: RostersView }) {
  return (
    <section aria-labelledby="holders" className="space-y-3">
      <SectionHeader
        id="holders"
        title="Conservation and preservation restrictions"
        action={<AddHolder />}
      />
      <p className="m-0">{SECTION_LINES.restrictions}</p>
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 font-medium">{view.landRecords.text}</p>
        {view.landRecords.due ? <StatusChip status="overdue" label="Due for a check" /> : null}
        <ActionForm action={recordLandRecordsCheckAction} submitLabel="Record a check" compact>
          {null}
        </ActionForm>
      </div>
      {view.restrictions.length === 0 ? (
        <p className="m-0">No restriction holders on file. Add one with Add holder.</p>
      ) : (
        <RestrictionTable rows={view.restrictions} today={view.today} />
      )}
    </section>
  )
}

export function RegionalSection({ view }: { view: RostersView }) {
  return (
    <section aria-labelledby="regional" className="space-y-3">
      <h2 id="regional" className="m-0">
        Regional and state contacts
      </h2>
      <p className="m-0">{SECTION_LINES.regional}</p>
      <dl className="m-0 space-y-2">
        {view.regionalContacts.map((c) => (
          <div key={c.role}>
            <dt className="font-medium">{c.role}</dt>
            <dd className="m-0">{c.lines.length === 0 ? 'None on file' : c.lines.join('; ')}</dd>
          </div>
        ))}
      </dl>
      {view.canEditSettings ? (
        <p className="m-0">
          <Link href="/staff/settings/regional_contacts">Change these in Settings</Link>
        </p>
      ) : (
        <p className="m-0 text-muted-foreground">An administrator changes these in Settings.</p>
      )}
    </section>
  )
}
