import type { ImportRunReport } from '@/features/gis/import/types'

const ROWS = [
  ['Rows in', 'countIn'],
  ['Created', 'countCreated'],
  ['Applied', 'countApplied'],
  ['Unchanged', 'countUnchanged'],
  ['Excepted', 'countExcepted'],
  ['Source features', 'countSourceFeatures'],
  ['Merged parts', 'countMergedParts'],
  ['Missing from layer', 'countMissingFromLayer'],
] as const

export function RunReport({ report }: { report: ImportRunReport }) {
  const kinds = Object.entries(report.exceptionsByKind)
  return (
    <div>
      <dl className="grid max-w-md grid-cols-[12rem_1fr] gap-y-1">
        {ROWS.map(([label, key]) => (
          <div key={key} className="contents">
            <dt className="font-semibold">{label}</dt>
            <dd>{report[key]}</dd>
          </div>
        ))}
      </dl>
      {kinds.length === 0 ? null : (
        <>
          <h3 className="mt-4 text-base font-semibold">Exceptions by kind</h3>
          <ul>
            {kinds.map(([kind, count]) => (
              <li key={kind}>
                <span>{kind.replaceAll('_', ' ')}</span>
                {`: ${count}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
