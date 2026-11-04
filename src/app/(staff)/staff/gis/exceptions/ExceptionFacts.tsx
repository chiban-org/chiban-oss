import { ownerChangeRows } from '@/features/gis/exceptionView'

export function ExceptionFacts({ payload }: { payload: unknown }) {
  const rows = ownerChangeRows(payload)
  if (rows.length === 0) return null
  return (
    <table className="w-full table-fixed text-sm [&_td]:break-words">
      <colgroup>
        <col className="w-24 sm:w-44" />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Stored now</th>
          <th scope="col">In the import</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="font-normal text-muted-foreground">
              {row.label}
            </th>
            <td>{row.stored}</td>
            <td className={row.changed ? 'font-medium' : undefined}>
              {row.changed ? (
                <>
                  <span className="sr-only">Changed to </span>
                  <span className="attention">{row.incoming}</span>
                </>
              ) : (
                row.incoming
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
