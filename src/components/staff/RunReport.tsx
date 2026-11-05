import { DescriptionList } from '@/components/ui/description-list'
import { exceptionKindLabel } from '@/features/gis/exceptionLabels'
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
      <DescriptionList
        labelWidth="wide"
        className="tabular-nums"
        items={ROWS.map(([label, key]) => ({ label, value: report[key] }))}
      />
      {kinds.length === 0 ? null : (
        <>
          <h3 className="mt-4 text-base font-semibold">Exceptions by kind</h3>
          <ul>
            {kinds.map(([kind, count]) => (
              <li key={kind}>{`${exceptionKindLabel(kind)}: ${count}`}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
