import { NEW_TAB } from '@/components/newTab'
import { db } from '@/db/client'
import { loadPublicBoardRecords, type PublicPage } from '@/features/hearings/publicRecords'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center'
const PAGE = /^[1-9]\d{0,5}$/

interface Props {
  searchParams: Promise<{ agendas?: string | string[] }>
}

function pageFrom(value: string | string[] | undefined): number {
  return typeof value === 'string' && PAGE.test(value) ? Number(value) : 1
}

function AgendaPager({ page, hasNext }: PublicPage) {
  if (page === 1 && !hasNext) return null
  return (
    <nav aria-label="Agenda pages" className="flex flex-wrap gap-4">
      {page > 1 ? (
        <a href={`/meetings?agendas=${page - 1}`} className={LINK}>
          Newer agendas
        </a>
      ) : null}
      {hasNext ? (
        <a href={`/meetings?agendas=${page + 1}`} className={LINK}>
          Older agendas
        </a>
      ) : null}
    </nav>
  )
}

export default async function PublicMeetingsPage({ searchParams }: Props) {
  const records = await loadPublicBoardRecords(db, AbortSignal.timeout(TIMEOUT_MS), {
    agendaPage: pageFrom((await searchParams).agendas),
  })
  return (
    <main className="space-y-8">
      <h1>Board meetings and decisions</h1>
      <section aria-label="Agendas" className="space-y-3">
        <h2>Agendas</h2>
        {records.agendas.length === 0 ? (
          <p>
            {records.agendaPage.page === 1
              ? 'No agendas have been published yet.'
              : 'No more agendas.'}
          </p>
        ) : null}
        <ul className="m-0 list-none space-y-2 p-0">
          {records.agendas.map((a) => (
            <li key={a.meetingId}>
              <a {...NEW_TAB} href={`/api/documents/${a.documentId}`} className={LINK}>
                {`Agenda: ${a.text}`}
              </a>
            </li>
          ))}
        </ul>
        <AgendaPager {...records.agendaPage} />
      </section>
      <section aria-label="Decisions" className="space-y-3">
        <h2>Decisions</h2>
        {records.decisions.length === 0 ? <p>No decisions have been filed yet.</p> : null}
        <ul className="m-0 list-none space-y-3 p-0">
          {records.decisions.map((d) => (
            <li key={d.decisionId} className="space-y-1">
              <p className="m-0 font-semibold">{d.text}</p>
              <p className="m-0">{`Filed ${d.filedText}.`}</p>
              <div className="flex flex-wrap gap-4">
                {d.decisionDocumentId === null ? null : (
                  <a {...NEW_TAB} href={`/api/documents/${d.decisionDocumentId}`} className={LINK}>
                    Notice of Decision
                  </a>
                )}
                {d.minutesDocumentId === null ? null : (
                  <a {...NEW_TAB} href={`/api/documents/${d.minutesDocumentId}`} className={LINK}>
                    Minutes
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
