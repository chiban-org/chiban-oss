import { NEW_TAB } from '@/components/newTab'
import type { DocumentListRow } from '@/features/documents/types'

export function DocumentsList({ documents }: { documents: DocumentListRow[] }) {
  return (
    <section aria-label="Documents">
      <h2>Documents</h2>
      {documents.length === 0 ? <p>No documents are attached.</p> : null}
      <ul className="space-y-1">
        {documents.map((d) => (
          <li key={d.documentId}>
            <a
              {...NEW_TAB}
              href={`/api/documents/${d.documentId}`}
              className="text-action underline"
            >
              {d.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
