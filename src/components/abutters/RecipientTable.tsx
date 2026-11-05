import Link from 'next/link'
import type { ReactNode } from 'react'
import type { RecipientView } from '@/features/abutters/listView'

interface Props {
  rows: RecipientView[]
  renderControls?: (row: RecipientView) => ReactNode
}

export function RecipientTable({ rows, renderControls }: Props) {
  if (rows.length === 0) return <p>Nobody is on this list yet.</p>
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">People who receive notice</caption>
      <thead>
        <tr>
          <th scope="col">Name and mailing address</th>
          <th scope="col">Receives notice as</th>
          <th scope="col">Where the information came from</th>
          {renderControls === undefined ? null : <th scope="col">Action</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="align-top">
            <td>
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
                  <li key={line.text}>
                    {line.href === null ? line.text : <Link href={line.href}>{line.text}</Link>}
                  </li>
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
