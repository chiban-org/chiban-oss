import Link from 'next/link'
import { TablePager } from '@/components/dataTable/TablePager'
import { SectionHeader } from '@/components/layout/ListHeader'
import { DescriptionList } from '@/components/ui/description-list'
import { pagerLinks } from '@/features/dataTable/pageSlice'
import type { TableParams } from '@/features/dataTable/params'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'
import type { RostersView } from '@/features/rosters/rosterView'
import { AddAssociation } from './AssociationForms'
import { SECTION_LINES } from './ContactSections'
import { ContactToolbar } from './ContactToolbar'
import { ParcelLink } from './RowParts'

export function GapsSection({ view, params }: { view: RostersView; params: TableParams }) {
  const { gaps } = view
  return (
    <section aria-labelledby="gaps">
      <SectionHeader
        id="gaps"
        title="Condo parcels with no association on file"
        lead={SECTION_LINES.gaps}
      />
      <ContactToolbar params={params} query={view.query} counts={null} />
      {gaps.rows.length === 0 ? (
        <p>No condo parcels match.</p>
      ) : (
        <ul className="table-panel list-none divide-y divide-hairline p-0">
          {gaps.rows.map((g) => (
            <li key={g.parcelId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <ParcelLink parcelId={g.parcelId} label={g.parcel} />
              <span className="min-w-0 flex-1">{`${g.siteAddress ?? 'Address not on file'}, ${g.units} units`}</span>
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
      )}
      <TablePager {...pagerLinks(NOTICE_CONTACTS_PATH, params, gaps)} />
    </section>
  )
}

export function RegionalSection({ view }: { view: RostersView }) {
  return (
    <section aria-labelledby="regional">
      <SectionHeader
        id="regional"
        title="Regional and state contacts"
        lead={SECTION_LINES.regional}
      />
      <DescriptionList
        labelWidth="wide"
        items={view.regionalContacts.map((c) => ({
          label: c.role,
          value:
            c.lines.length === 0 ? (
              <span className="text-muted-foreground">None on file</span>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0">
                {c.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ),
        }))}
      />
      {view.canEditSettings ? (
        <p>
          <Link href="/staff/settings/regional_contacts">Change these in Settings</Link>
        </p>
      ) : (
        <p className="text-muted-foreground">An administrator changes these in Settings.</p>
      )}
    </section>
  )
}
