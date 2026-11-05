import type { UserDetail } from '@/features/users/userDetail'
import { formatInstantLong } from '@/lib/formatDate'

export function HistoryPanel({ detail, timeZone }: { detail: UserDetail; timeZone: string }) {
  return (
    <section aria-labelledby="history">
      <h2 id="history">History</h2>
      {detail.history.length === 0 ? (
        <p className="text-muted-foreground">
          No changes recorded. Invites, role changes and access changes appear here.
        </p>
      ) : (
        <ol className="list-none p-0">
          {detail.history.map((entry) => (
            <li key={entry.id} className="record-item">
              <p className="m-0">{entry.text}</p>
              <p className="m-0 text-sm text-muted-foreground">
                {`${entry.byName}, ${formatInstantLong(entry.at, timeZone)}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
