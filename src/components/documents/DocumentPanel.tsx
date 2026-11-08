import { type DocumentPanelProps, DocumentRow } from '@/components/documents/DocumentRow'
import { SeriesLine, sharedSeries } from '@/components/documents/RecordKeeping'
import { SectionHeader } from '@/components/layout/ListHeader'

export type { DocumentPanelActions } from '@/components/documents/DocumentRow'

export function DocumentPanel(props: DocumentPanelProps) {
  const series = sharedSeries(props.documents)
  const title = props.title ?? 'Documents'
  return (
    <section aria-label={title}>
      {props.documents.length === 0 ? (
        <>
          <h2>{title}</h2>
          <p>{props.emptyText ?? 'No documents are attached.'}</p>
        </>
      ) : (
        <SectionHeader
          title={title}
          lead={
            props.intro === undefined && series === undefined ? undefined : (
              <>
                {props.intro}
                {series === undefined ? null : (
                  <p className="m-0 text-sm">
                    <SeriesLine series={series} />
                  </p>
                )}
              </>
            )
          }
        />
      )}
      {props.lead}
      <ul className="list-none p-0">
        {props.documents.map((doc) => (
          <DocumentRow
            key={doc.documentId}
            doc={doc}
            props={props}
            seriesShown={series !== undefined}
          />
        ))}
      </ul>
      {props.children}
    </section>
  )
}
