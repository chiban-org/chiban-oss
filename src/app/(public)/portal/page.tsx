import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { stateLabel } from '@/features/applications/stateLabel'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const DEFAULT_ZONE = 'America/New_York'
const LINK = 'tap-target inline-flex items-center'

function isCoreState(state: string): state is CoreState {
  return (CORE_STATES as readonly string[]).includes(state)
}

export default async function PortalHomePage() {
  const ctx = await requirePortalContext('/portal')
  const [page, town] = await Promise.all([
    listApplicationsForViewer(ctx.db, ctx.actor, { limit: PAGE_SIZE }, ctx.signal),
    getTownSettings(ctx.db, ctx.signal),
  ])
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  return (
    <main className="space-y-6">
      <h1>Your applications</h1>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        <li>
          <Link href="/portal/apply" className={LINK}>
            Start an application
          </Link>
        </li>
        <li>
          <Link href="/portal/contractor" className={LINK}>
            Contractor projects
          </Link>
        </li>
        <li>
          <Link href="/parcels" className={LINK}>
            Look up a parcel
          </Link>
        </li>
      </ul>
      {page.rows.length === 0 ? (
        <p>You have no applications yet. Start one above.</p>
      ) : (
        <ul className="m-0 list-none divide-y p-0">
          {page.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/portal/applications/${row.id}`} className={`${LINK} font-semibold`}>
                  {row.projectTitle}
                </Link>
                <p className="m-0">{`${row.number}, started ${formatInstant(row.createdAt, zone)}`}</p>
              </div>
              <StatusChip
                status={isCoreState(row.state) ? applicationChipStatus(row.state) : 'neutral'}
                label={isCoreState(row.state) ? stateLabel(row.state) : row.state}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
