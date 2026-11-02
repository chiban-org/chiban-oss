import Link from 'next/link'
import { redirect } from 'next/navigation'
import { StatusChip } from '@/components/StatusChip'
import { db } from '@/db/client'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { stateLabel } from '@/features/applications/stateLabel'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import type { Status } from '@/features/design/tokens'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { getActor } from '@/server/getActor'

const TIMEOUT_MS = 10_000
const PAGE_SIZE = 50
const DEFAULT_ZONE = 'America/New_York'

function isCoreState(state: string): state is CoreState {
  return (CORE_STATES as readonly string[]).includes(state)
}

function chipStatus(state: CoreState): Status {
  if (state === 'issued') return 'passed'
  if (state === 'denied' || state === 'expired') return 'failed'
  return 'neutral'
}

export default async function AccountPage() {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await getActor(signal)
  if (actor === null) redirect('/sign-in')
  const [page, town] = await Promise.all([
    listApplicationsForViewer(db, actor, { limit: PAGE_SIZE }, signal),
    getTownSettings(db, signal),
  ])
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  return (
    <main>
      <h1>Your applications</h1>
      {page.rows.length === 0 ? (
        <p>
          You have no applications yet.{' '}
          <Link href="/parcels" className="underline">
            Look up a parcel
          </Link>{' '}
          to get started.
        </p>
      ) : (
        <ul className="divide-y">
          {page.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-semibold">{row.projectTitle}</p>
                <p>
                  {row.number}
                  {`, started ${formatInstant(row.createdAt, zone)}`}
                </p>
                <Link
                  href={`/parcels/${row.parcelId}`}
                  className="tap-target inline-flex underline"
                >
                  View the parcel
                </Link>
              </div>
              {isCoreState(row.state) ? (
                <StatusChip status={chipStatus(row.state)} label={stateLabel(row.state)} />
              ) : (
                <StatusChip status="neutral" label={row.state} />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
