import { SortHeader } from '@/components/dataTable/SortHeader'
import type { HoldingRow } from '@/features/rosters/contactRows'
import { EditHolder, EndHolder, UndoEnd } from './HolderForms'
import {
  ACTIONS_CELL,
  ContactSortBar,
  type ContactSortLinks,
  EntryRow,
  PANEL_CLASS,
  STACKED_CELL,
  StatusCell,
  TABLE_CLASS,
  TITLE_CELL,
} from './RowCells'
import { ActionsHeader, Checked, ParcelLink, RowActions, UsedBy } from './RowParts'

function EndAction({ row, today }: { row: HoldingRow; today: string }) {
  if (row.endedOn === null) return <EndHolder row={row} today={today} />
  return row.undoable ? <UndoEnd row={row} /> : null
}

export function RestrictionTable({
  rows,
  today,
  links,
}: {
  rows: HoldingRow[]
  today: string
  links: ContactSortLinks
}) {
  return (
    <>
      <ContactSortBar name="Holder" links={links} />
      <div className={PANEL_CLASS}>
        <table className={TABLE_CLASS}>
          <caption className="sr-only">Restriction holders</caption>
          <thead className="max-md:hidden">
            <tr>
              <SortHeader label="Holder" link={links.name} />
              <th scope="col">Kind</th>
              <SortHeader label="Parcel" link={links.parcel} />
              <th scope="col">Status</th>
              <SortHeader label="Checked" link={links.checked} />
              <th scope="col">Used by</th>
              <ActionsHeader />
            </tr>
          </thead>
          <tbody className="max-md:block">
            {rows.map((r) => (
              <EntryRow key={r.entryId} row={r}>
                <td className={TITLE_CELL}>
                  <p className="m-0 font-semibold">{r.holder}</p>
                  <p className="m-0">{r.holderMailingAddress}</p>
                </td>
                <td data-label="Kind" className={STACKED_CELL}>
                  <span>
                    <span className="min-[90rem]:whitespace-nowrap">{r.kindText}</span>
                    <br />
                    <span className="text-muted-foreground">{r.reference}</span>
                  </span>
                </td>
                <td data-label="Parcel" className={STACKED_CELL}>
                  <ParcelLink parcelId={r.parcelId} label={r.parcel} />
                </td>
                <StatusCell row={r} />
                <td data-label="Checked" className={STACKED_CELL}>
                  <Checked row={r} />
                </td>
                <td data-label="Used by" className={STACKED_CELL}>
                  <UsedBy row={r} />
                </td>
                <td className={ACTIONS_CELL}>
                  <RowActions
                    row={r}
                    kind="restriction"
                    record={`${r.holder} on ${r.parcel}`}
                    edit={<EditHolder row={r} />}
                    end={<EndAction row={r} today={today} />}
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
