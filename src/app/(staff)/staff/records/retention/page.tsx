import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { TablePager } from '@/components/dataTable/TablePager'
import { NoPermission } from '@/components/staff/NoPermission'
import type { Db } from '@/db/client'
import { dispositionBatches } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { pageHref, type RawSearchParams, tableHref } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import { retentionWorklist, WORKLIST_SORT, type WorklistPage } from '@/features/records/worklist'
import { RETENTION_PATH, readRetentionView } from '@/features/records/worklistParams'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { getTownSettings } from '@/features/town/settings'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { BatchesSection } from './BatchesSection'
import { WorklistTable } from './WorklistTable'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const BATCH_PREVIEW = 10

function stateTabs(view: ReturnType<typeof readRetentionView>, list: WorklistPage) {
  const count = (state: 'eligible' | 'awaiting_event' | 'on_hold') => list.counts.get(state) ?? 0
  return filterTabs(RETENTION_PATH, view.params, {
    param: 'state',
    label: 'Retention lists',
    defaultTab: 'eligible',
    options: [
      { value: 'eligible', label: 'Eligible now', count: count('eligible') },
      { value: 'awaiting_event', label: 'Waiting for an event', count: count('awaiting_event') },
      { value: 'on_hold', label: 'On legal hold', count: count('on_hold') },
    ],
  })
}

function OnHoldNote({ holdsLink }: { holdsLink: boolean }) {
  return (
    <p>
      Records kept permanently are not listed here, since they are never disposed of.{' '}
      {holdsLink ? (
        <>
          Every hold, including holds on them, is on the{' '}
          <Link href="/staff/records/holds">Legal holds</Link> page.
        </>
      ) : (
        'A records custodian manages legal holds.'
      )}
    </p>
  )
}

async function loadBatches(db: Db, all: boolean) {
  const newest = db
    .select()
    .from(dispositionBatches)
    .orderBy(desc(dispositionBatches.proposedAt), desc(dispositionBatches.id))
    .$dynamic()
  return all ? await newest : await newest.limit(BATCH_PREVIEW + 1)
}

function emptyText(state: string): string {
  if (state === 'eligible') return 'No record can be disposed of yet.'
  if (state === 'awaiting_event') return 'No record is waiting for an event.'
  return 'No record is on legal hold.'
}

export default async function RetentionPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const view = readRetentionView(await searchParams)
  const ctx = await requireStaffContext()
  const viewer = await loadNavViewer(ctx.db, ctx.actor, ctx.signal)
  if (!mayOpen(RETENTION_PATH, viewer)) {
    return <NoPermission title="Retention" action="see the retention worklist" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  const [list, mayRecord, batches] = await Promise.all([
    retentionWorklist(
      ctx.db,
      ctx.actor,
      { asOf: today, state: view.state, limit: PAGE_SIZE, offset: view.offset, sort: view.sort },
      ctx.signal,
    ),
    hasCapability(ctx.db, ctx.actor.userId, 'document.manage', ctx.signal),
    loadBatches(ctx.db, view.allBatches),
  ])
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(RETENTION_PATH, view.params, String(offset))
  return (
    <main data-wide="">
      <h1>Retention</h1>
      <p>
        Records under a retention schedule, by whether they can be disposed of now. Earliest
        eligible date first.
      </p>
      <FilterTabs label="Retention lists" tabs={stateTabs(view, list)} />
      {view.state === 'on_hold' ? (
        <OnHoldNote holdsLink={mayOpen('/staff/records/holds', viewer)} />
      ) : null}
      <div className="table-panel">
        {list.rows.length === 0 ? (
          <p className="px-5 py-8">{emptyText(view.state)}</p>
        ) : (
          <WorklistTable
            rows={list.rows}
            state={view.state}
            links={sortLinks(RETENTION_PATH, view.params, WORKLIST_SORT, view.sort)}
            mayRecord={mayRecord}
          />
        )}
      </div>
      <TablePager
        offset={list.offset}
        shown={list.rows.length}
        total={list.total}
        prevHref={pageLink(list.prevOffset)}
        nextHref={pageLink(list.nextOffset)}
      />
      <BatchesSection
        batches={view.allBatches ? batches : batches.slice(0, BATCH_PREVIEW)}
        more={!view.allBatches && batches.length > BATCH_PREVIEW}
        allHref={tableHref(RETENTION_PATH, view.params, { batches: 'all' })}
        zone={zone}
        today={today}
      />
    </main>
  )
}
