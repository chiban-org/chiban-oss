import { ownerChangeRows } from '@/features/gis/exceptionView'

export function ExceptionFacts({ payload }: { payload: unknown }) {
  const rows = ownerChangeRows(payload)
  if (rows.length === 0) return null
  return (
    <table className="mt-2 text-sm">
      <thead>
        <tr>
          <th scope="col" className="pr-4 text-left">
            Field
          </th>
          <th scope="col" className="pr-4 text-left">
            Stored now
          </th>
          <th scope="col" className="text-left">
            In the import
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="pr-4 text-left font-normal">
              {row.changed ? `${row.label} (changed)` : row.label}
            </th>
            <td className="pr-4">{row.stored}</td>
            <td>{row.incoming}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
