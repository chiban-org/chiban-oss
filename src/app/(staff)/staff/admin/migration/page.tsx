import type { Metadata } from 'next'
import { NoIdFormatsNotice } from '@/components/parcels/NoIdFormatsNotice'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { listBatches } from '@/features/migration/batchQueries'
import { hasIdFormats } from '@/features/parcels/idFormatCopy'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { STATUS_COPY } from './statusCopy'

export const metadata: Metadata = { title: 'Scanned property files' }

export const dynamic = 'force-dynamic'

export default async function MigrationPage() {
  const ctx = await requireStaffContext()
  const listed = await listBatches(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) {
    return <NoPermission title="Scanned property files" action="migrate scanned files" />
  }
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'UTC'
  return (
    <main>
      <SettingsHeader
        title="Scanned property files"
        lead="Batches of old scanned property files brought into Chiban. Nothing in a batch is public until someone with permission shows it on the public site."
      />
      {(await hasIdFormats(ctx.db)) ? null : <NoIdFormatsNotice canEdit />}
      <p>
        Each batch is one folder of scanned files that an operator scanned and ran with the legacy
        documents command. Originals are kept as they are, and a searchable PDF/A copy is stored
        alongside.
      </p>
      <section aria-labelledby="batches">
        <h2 id="batches">Batches</h2>
        {listed.value.length === 0 ? <p>No batches have been scanned yet.</p> : null}
        <ul className="list-none space-y-3 p-0">
          {listed.value.map((batch) => (
            <li key={batch.id} className="record-item">
              <p className="m-0 font-medium">
                <a href={`/staff/admin/migration/${batch.id}`}>{batch.name}</a>
              </p>
              <p className="m-0">
                {STATUS_COPY[batch.status]}. Scanned {formatInstantDate(batch.createdAt, zone)}.
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
