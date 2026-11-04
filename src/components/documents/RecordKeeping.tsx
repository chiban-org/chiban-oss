import { StatusChip } from '@/components/StatusChip'
import type { PanelDocument, PreservationState } from '@/features/documents/panelData'

const PRESERVATION_CHIP: Record<
  PreservationState,
  { status: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  preserved: { status: 'passed', label: 'Preserved' },
  incomplete: { status: 'failed', label: 'Preservation incomplete' },
  not_required: { status: 'neutral', label: 'Preservation not required' },
  pending: { status: 'overdue', label: 'Preservation pending' },
}

export function sharedSeries(documents: PanelDocument[]): PanelDocument['series'] | undefined {
  const first = documents[0]
  if (first === undefined) return undefined
  const label = first.series?.label ?? null
  return documents.every((d) => (d.series?.label ?? null) === label) ? first.series : undefined
}

export function SeriesLine({ series }: { series: PanelDocument['series'] }) {
  if (series === null) return <>No record series assigned.</>
  return (
    <>
      <span>{`Record series: ${series.label}`}</span>{' '}
      <a href={series.citation.url}>{series.citation.label}</a>
    </>
  )
}

export function RecordKeeping({ doc, seriesShown }: { doc: PanelDocument; seriesShown: boolean }) {
  const chip = PRESERVATION_CHIP[doc.preservation]
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span>
        <StatusChip status={chip.status} label={chip.label} />
      </span>
      {seriesShown ? null : (
        <p className="m-0">
          <SeriesLine series={doc.series} />
        </p>
      )}
      {doc.series === null ? null : <p className="m-0">{`Retention: ${doc.retention}`}</p>}
    </div>
  )
}
