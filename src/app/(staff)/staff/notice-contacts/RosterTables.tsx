import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import type { AssociationRow, ParkRow } from '@/features/rosters/contactRows'
import { listDatedText } from '@/features/rosters/recheck'
import { EditAssociation } from './AssociationForms'
import { EndOrUndo } from './EndForms'
import { EditPark } from './ParkForms'
import {
  ACTIONS_CELL,
  ContactSortBar,
  type ContactSortLinks,
  EntryRow,
  PANEL_CLASS,
  STACKED_CELL,
  StatusCell,
  TABLE_CLASS,
  TenantList,
  TITLE_CELL,
} from './RowCells'
import { ActionsHeader, Checked, ParcelLink, PersonLines, RowActions, UsedBy } from './RowParts'

interface TableProps<R> {
  rows: R[]
  today: string
  links: ContactSortLinks
}

function NameCell({ name, asOf }: { name: string; asOf: string }) {
  return (
    <td className={TITLE_CELL}>
      <p className="m-0 font-semibold">{name}</p>
      <p className="m-0 text-muted-foreground">{listDatedText(asOf)}</p>
    </td>
  )
}

export function AssociationTable({ rows, today, links }: TableProps<AssociationRow>) {
  return (
    <>
      <ContactSortBar name="Association" links={links} />
      <div className={PANEL_CLASS}>
        <table className={TABLE_CLASS}>
          <caption className="sr-only">Condo associations</caption>
          <thead className="max-md:hidden">
            <tr>
              <SortHeader label="Association" link={links.name} />
              <SortHeader label="Parcel" link={links.parcel} />
              <th scope="col">Officers who get notice</th>
              <th scope="col">Status</th>
              <SortHeader label="Checked" link={links.checked} />
              <th scope="col">Used by</th>
              <ActionsHeader />
            </tr>
          </thead>
          <tbody className="max-md:block">
            {rows.map((a) => (
              <EntryRow key={a.entryId} row={a}>
                <NameCell name={a.name} asOf={a.asOf} />
                <td data-label="Parcel" className={STACKED_CELL}>
                  <ParcelLink parcelId={a.parcelId} label={a.parcel} />
                </td>
                <td data-label="Officers" className={STACKED_CELL}>
                  <PersonLines
                    people={a.officers.map((o, i) => ({ key: `${i}`, ...o, middle: o.title }))}
                  />
                </td>
                <StatusCell row={a} />
                <td data-label="Checked" className={STACKED_CELL}>
                  <Checked row={a} />
                </td>
                <td data-label="Used by" className={STACKED_CELL}>
                  <UsedBy row={a} />
                </td>
                <td className={ACTIONS_CELL}>
                  <RowActions
                    row={a}
                    kind="association"
                    record={a.name}
                    edit={a.endedOn === null ? <EditAssociation row={a} today={today} /> : null}
                    end={<EndOrUndo row={a} kind="association" today={today} />}
                  />
                </td>
              </EntryRow>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function ParkTable({ rows, today, links }: TableProps<ParkRow>) {
  return (
    <>
      <ContactSortBar name="Park" links={links} />
      <div className={PANEL_CLASS}>
        <table className={TABLE_CLASS}>
          <caption className="sr-only">Manufactured housing parks</caption>
          <thead className="max-md:hidden">
            <tr>
              <SortHeader label="Park" link={links.name} />
              <SortHeader label="Parcel" link={links.parcel} />
              <th scope="col">Owner</th>
              <th scope="col">Tenants</th>
              <th scope="col">Status</th>
              <SortHeader label="Checked" link={links.checked} />
              <th scope="col">Used by</th>
              <ActionsHeader />
            </tr>
          </thead>
          <tbody className="max-md:block">
            {rows.map((p) => (
              <EntryRow key={p.entryId} row={p}>
                <NameCell name={p.name} asOf={p.asOf} />
                <td data-label="Parcel" className={STACKED_CELL}>
                  <ParcelLink parcelId={p.parcelId} label={p.parcel} />
                </td>
                <td data-label="Owner" className={STACKED_CELL}>
                  <span>
                    <Link
                      href={`/staff/parcels?q=${encodeURIComponent(p.owner)}`}
                      aria-label={`Search parcels owned by ${p.owner}`}
                      className="font-medium"
                    >
                      {p.owner}
                    </Link>
                    <br />
                    {p.ownerMailingAddress}
                  </span>
                </td>
                <td data-label="Tenants" className={STACKED_CELL}>
                  <TenantList tenants={p.tenants} />
                </td>
                <StatusCell row={p} />
                <td data-label="Checked" className={STACKED_CELL}>
                  <Checked row={p} />
                </td>
                <td data-label="Used by" className={STACKED_CELL}>
                  <UsedBy row={p} />
                </td>
                <td className={ACTIONS_CELL}>
                  <RowActions
                    row={p}
                    kind="park"
                    record={p.name}
                    edit={p.endedOn === null ? <EditPark row={p} today={today} /> : null}
                    end={<EndOrUndo row={p} kind="park" today={today} />}
                  />
                </td>
              </EntryRow>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
