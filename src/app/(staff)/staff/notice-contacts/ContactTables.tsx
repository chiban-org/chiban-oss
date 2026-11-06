import type { HoldingRow } from '@/features/rosters/contactRows'
import { entryAnchor } from '@/features/rosters/links'
import { EditHolder, EndHolder, UndoEnd } from './HolderForms'
import { ActionsHeader, Checked, ParcelLink, PersonLines, RowActions, UsedBy } from './RowParts'

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
