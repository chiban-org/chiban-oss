import { listBatches } from '@/features/migration/batchQueries'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { STATUS_COPY } from './statusCopy'

export const dynamic = 'force-dynamic'

export default async function MigrationPage() {
  const ctx = await requireStaffContext()
  const listed = await listBatches(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) {
    return (
      <main>
        <h1>Scanned property files</h1>
        <p role="alert">You do not have permission to migrate scanned files.</p>
      </main>
    )
  }
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'UTC'
  return (
    <main>
      <h1>Scanned property files</h1>
      <p>
        Each batch is one folder of scanned files that an operator scanned and ran with the legacy
        documents command. Originals are kept as they are, and a searchable PDF/A copy is stored
        alongside. Nothing in a batch is public until someone with permission publishes it.
      </p>
      {listed.value.length === 0 ? <p>No batches have been scanned yet.</p> : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {listed.value.map((batch) => (
          <li key={batch.id} className="rounded-md border p-3">
            <p className="m-0 font-medium">
              <a className="text-action underline" href={`/staff/admin/migration/${batch.id}`}>
                {batch.name}
              </a>
            </p>
            <p className="m-0">
              {STATUS_COPY[batch.status]}. Scanned {formatInstantDate(batch.createdAt, zone)}.
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
