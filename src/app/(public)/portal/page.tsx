import type { Metadata } from 'next'
import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { stateLabel } from '@/features/applications/stateLabel'
import type { HomeGroup } from '@/features/portal/homeGroups'
import { type HomeRow, loadPortalHome } from '@/features/portal/homeView'
import { requirePortalContext } from '@/server/requirePortal'

export const metadata: Metadata = { title: 'Your applications' }

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center'

const GROUP_TITLES: Record<HomeGroup, string> = {
  needs_you: 'Needs you',
  in_progress: 'In progress',
  finished: 'Finished',
}

function Row({ row }: { row: HomeRow }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/portal/applications/${row.id}`} className={`${LINK} font-semibold`}>
          {row.address ?? row.projectTitle}
        </Link>
        <p className="m-0 text-ink-secondary">{`${row.projectTitle}, ${row.number}`}</p>
        <p className="m-0">{row.nextStep}</p>
      </div>
      <StatusChip status={applicationChipStatus(row.state)} label={stateLabel(row.state)} />
    </li>
  )
}

function Group({ group, rows }: { group: HomeGroup; rows: HomeRow[] }) {
  if (rows.length === 0) return null
  const list = (
    <ul className="m-0 list-none divide-y p-0">
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </ul>
  )
  const title = `${GROUP_TITLES[group]} (${rows.length})`
  if (group === 'finished') {
    return (
      <section aria-label={GROUP_TITLES[group]}>
        <details>
          <summary className="tap-target inline-flex cursor-pointer items-center">
            <h2 className="m-0 inline">{title}</h2>
          </summary>
          {list}
        </details>
      </section>
    )
  }
  return (
    <section aria-label={GROUP_TITLES[group]}>
      <h2>{title}</h2>
      {list}
    </section>
  )
}

export default async function PortalHomePage() {
  const ctx = await requirePortalContext('/portal')
  const rows = await loadPortalHome(ctx.db, ctx.actor, ctx.signal)
  return (
    <main className="flex flex-col gap-6">
      <h1>Your applications</h1>
      {ctx.actor.kind === 'staff' ? (
        <p className="text-muted-foreground">
          {'This page lists applications you filed yourself. Town applications are in the '}
          <Link href="/staff">staff area</Link>.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button asChild className="min-h-11 text-base no-underline">
          <Link href="/portal/apply">Start an application</Link>
        </Button>
        <Link href="/portal/contractor" className={LINK}>
          Contractor projects
        </Link>
        <Link href="/parcels" className={LINK}>
          Look up a parcel
        </Link>
      </div>
      {rows.length === 0 ? (
        <p>You have no applications yet. Start one above.</p>
      ) : (
        (['needs_you', 'in_progress', 'finished'] as const).map((group) => (
          <Group key={group} group={group} rows={rows.filter((r) => r.group === group)} />
        ))
      )}
    </main>
  )
}
