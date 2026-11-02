import type { ReactNode } from 'react'
import type { CandidateRow } from '@/features/abutters/listView'

interface Props {
  rows: CandidateRow[]
  renderControls?: (row: CandidateRow) => ReactNode
}

export function CandidateTable({ rows, renderControls }: Props) {
  const staff = rows.filter((r) => r.staffSelected)
  const rest = rows.filter((r) => !r.staffSelected)
  if (rows.length === 0) return <p>No parcels were found next to or across from this property.</p>
  return (
    <table className="my-3 w-full text-sm">
      <caption className="sr-only">Parcels considered for the abutter list</caption>
      <thead>
        <tr className="border-b text-left">
          <th scope="col" className="py-2">
            Parcel
          </th>
          <th scope="col">Owner on record</th>
          <th scope="col">Why it is on the list</th>
          {renderControls === undefined ? null : <th scope="col">Action</th>}
        </tr>
      </thead>
      <tbody>
        {staff.length > 0 ? (
          <tr>
            <th scope="rowgroup" colSpan={4} className="bg-surface py-1 text-left font-medium">
              Added by staff
            </th>
          </tr>
        ) : null}
        {staff.map((row) => (
          <CandidateLine key={row.parcelId} row={row} renderControls={renderControls} />
        ))}
        {staff.length > 0 && rest.length > 0 ? (
          <tr>
            <th scope="rowgroup" colSpan={4} className="bg-surface py-1 text-left font-medium">
              Found by the town's rules
            </th>
          </tr>
        ) : null}
        {rest.map((row) => (
          <CandidateLine key={row.parcelId} row={row} renderControls={renderControls} />
        ))}
      </tbody>
    </table>
  )
}

function CandidateLine({
  row,
  renderControls,
}: {
  row: CandidateRow
  renderControls: Props['renderControls']
}) {
  return (
    <tr className="border-b align-top">
      <td className="py-2">{row.parcelLabel}</td>
      <td>
        {row.owner}
        {row.noticeTo === null ? null : (
          <p className="m-0 text-muted-foreground">
            {`Notice goes to ${row.noticeTo}, the park owner named on the manufactured housing park roster.`}
          </p>
        )}
      </td>
      <td>
        <ul className="m-0 list-none p-0">
          {row.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {row.excluded ? (
          <p className="m-0 font-medium">{`Left off the list: ${row.exclusionReason ?? ''}`}</p>
        ) : null}
      </td>
      {renderControls === undefined ? null : <td>{renderControls(row)}</td>}
    </tr>
  )
}
