import { ACTIVITY_LIMIT, type ActivityEntry } from '@/features/applications/activity'
import { formatInstant } from '@/lib/formatDate'

export function ActivityPanel({ entries, zone }: { entries: ActivityEntry[]; zone: string }) {
  return (
    <section aria-label="Recent activity" id="activity">
      <h2>Recent activity</h2>
      <p className="text-muted-foreground">{`The latest ${ACTIVITY_LIMIT} changes to this application, newest first.`}</p>
      {entries.length === 0 ? <p>No changes recorded yet.</p> : null}
      <ul className="list-none space-y-2 p-0">
        {entries.map((e) => (
          <li key={e.id} className="record-item">
            <p className="m-0 font-medium">{`${e.who}, ${formatInstant(e.at, zone)}`}</p>
            <p className="m-0">{e.what}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
