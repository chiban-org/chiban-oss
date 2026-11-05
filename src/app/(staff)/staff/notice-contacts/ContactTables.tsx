import Link from 'next/link'
import type { AssociationRow, HoldingRow, ParkRow } from '@/features/rosters/contactRows'
import { entryAnchor } from '@/features/rosters/links'
import { listDatedText } from '@/features/rosters/recheck'
import { EditAssociation } from './AssociationForms'
import { EditHolder, EndHolder, UndoEnd } from './HolderForms'
import { EditPark } from './ParkForms'
import { ActionsHeader, Checked, ParcelLink, PersonLines, RowActions, UsedBy } from './RowParts'

export function AssociationTable({ rows, today }: { rows: AssociationRow[]; today: string }) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[56rem] text-sm">
        <caption className="sr-only">Condo associations</caption>
        <thead>
          <tr>
            <th scope="col">Association</th>
            <th scope="col">Parcel</th>
            <th scope="col">Officers who get notice</th>
            <th scope="col">Checked</th>
            <th scope="col">Used by</th>
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.entryId} id={entryAnchor(a.entryId)} className="align-top">
              <td className="min-w-48">
                <p className="m-0 font-semibold">{a.name}</p>
                <p className="m-0 text-muted-foreground">{listDatedText(a.asOf)}</p>
              </td>
              <td>
                <ParcelLink parcelId={a.parcelId} label={a.parcel} />
              </td>
              <td>
                <PersonLines
                  people={a.officers.map((o, i) => ({ key: `${i}`, ...o, middle: o.title }))}
                />
              </td>
              <td>
                <Checked row={a} />
              </td>
              <td>
                <UsedBy row={a} />
              </td>
              <td>
                <RowActions
                  row={a}
                  kind="association"
                  record={a.name}
                  edit={<EditAssociation row={a} today={today} />}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ParkTable({ rows, today }: { rows: ParkRow[]; today: string }) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[60rem] text-sm">
        <caption className="sr-only">Manufactured housing parks</caption>
        <thead>
          <tr>
            <th scope="col">Park</th>
            <th scope="col">Parcel</th>
            <th scope="col">Owner</th>
            <th scope="col">Tenants</th>
            <th scope="col">Checked</th>
            <th scope="col">Used by</th>
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.entryId} id={entryAnchor(p.entryId)} className="align-top">
              <td className="min-w-40">
                <p className="m-0 font-semibold">{p.name}</p>
                <p className="m-0 text-muted-foreground">{listDatedText(p.asOf)}</p>
              </td>
              <td>
                <ParcelLink parcelId={p.parcelId} label={p.parcel} />
              </td>
              <td>
                <Link
                  href={`/staff/parcels?q=${encodeURIComponent(p.owner)}`}
                  aria-label={`Search parcels owned by ${p.owner}`}
                  className="font-medium"
                >
                  {p.owner}
                </Link>
                <br />
                {p.ownerMailingAddress}
              </td>
              <td>
                <PersonLines
                  people={p.tenants.map((t) => ({ key: t.tenantId, ...t, middle: t.siteLabel }))}
                />
              </td>
              <td>
                <Checked row={p} />
              </td>
              <td>
                <UsedBy row={p} />
              </td>
              <td>
                <RowActions
                  row={p}
                  kind="park"
                  record={p.name}
                  edit={<EditPark row={p} today={today} />}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RestrictionTable({ rows, today }: { rows: HoldingRow[]; today: string }) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[60rem] text-sm">
        <caption className="sr-only">Restriction holders</caption>
        <thead>
          <tr>
            <th scope="col">Holder</th>
            <th scope="col">Kind</th>
            <th scope="col">Parcel</th>
            <th scope="col">Recorded at</th>
            <th scope="col">Status</th>
            <th scope="col">Checked</th>
            <th scope="col">Used by</th>
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entryId} id={entryAnchor(r.entryId)} className="align-top">
              <td className="min-w-48">
                <PersonLines
                  people={[
                    {
                      key: 'holder',
                      name: r.holder,
                      middle: '',
                      mailingAddress: r.holderMailingAddress,
                    },
                  ]}
                />
              </td>
              <td>{r.kindText}</td>
              <td>
                <ParcelLink parcelId={r.parcelId} label={r.parcel} />
              </td>
              <td>{r.reference}</td>
              <td className="whitespace-nowrap">{r.statusText}</td>
              <td>
                <Checked row={r} />
              </td>
              <td>
                <UsedBy row={r} />
              </td>
              <td>
                <RowActions
                  row={r}
                  kind="restriction"
                  record={`${r.holder} on ${r.parcel}`}
                  edit={<EditHolder row={r} />}
                  extra={
                    r.endedOn === null ? (
                      <EndHolder row={r} today={today} />
                    ) : r.undoable ? (
                      <UndoEnd row={r} />
                    ) : null
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
