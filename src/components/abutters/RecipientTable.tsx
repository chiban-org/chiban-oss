import type { ReactNode } from 'react'
import type { RecipientView } from '@/features/abutters/listView'

interface Props {
  rows: RecipientView[]
  renderControls?: (row: RecipientView) => ReactNode
}

export function RecipientTable({ rows, renderControls }: Props) {
  if (rows.length === 0) return <p>Nobody is on this list yet.</p>
  return (
    <table className="my-3 w-full text-sm">
      <caption className="sr-only">People who receive notice</caption>
      <thead>
        <tr className="border-b text-left">
          <th scope="col" className="py-2">
            Name and mailing address
          </th>
          <th scope="col">Receives notice as</th>
          <th scope="col">Where the information came from</th>
          {renderControls === undefined ? null : <th scope="col">Action</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b align-top">
            <td className="py-2">
              <p className="m-0 font-medium">{row.name === '' ? 'Name not on record' : row.name}</p>
              <p className="m-0">{row.mailingAddress ?? 'No mailing address on record'}</p>
              {row.statusText === 'Complete' ? null : (
                <p className="m-0 font-medium">{row.statusText}</p>
              )}
              {row.decisionText === null ? null : <p className="m-0">{row.decisionText}</p>}
              {row.excluded ? (
                <p className="m-0 font-medium">{`Left off the list: ${row.exclusionReason ?? ''}`}</p>
              ) : null}
            </td>
            <td>{row.roles.join(', ')}</td>
            <td>
              <ul className="m-0 list-none p-0">
                {row.provenance.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </td>
            {renderControls === undefined ? null : <td>{renderControls(row)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
