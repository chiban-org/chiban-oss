import { db } from '@/db/client'
import { loadPublicBoardRecords } from '@/features/hearings/publicRecords'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center underline'

export default async function PublicMeetingsPage() {
  const records = await loadPublicBoardRecords(db, AbortSignal.timeout(TIMEOUT_MS))
  return (
    <main className="space-y-8">
      <h1>Board meetings and decisions</h1>
      <section aria-label="Agendas" className="space-y-3">
        <h2>Agendas</h2>
        {records.agendas.length === 0 ? <p>No agendas have been published yet.</p> : null}
        <ul className="m-0 list-none space-y-2 p-0">
          {records.agendas.map((a) => (
            <li key={a.meetingId}>
              <a href={`/api/documents/${a.documentId}`} className={LINK}>
                {`Agenda: ${a.text}`}
              </a>
            </li>
          ))}
        </ul>
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
                  <a href={`/api/documents/${d.decisionDocumentId}`} className={LINK}>
                    Notice of Decision
                  </a>
                )}
                {d.minutesDocumentId === null ? null : (
                  <a href={`/api/documents/${d.minutesDocumentId}`} className={LINK}>
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
