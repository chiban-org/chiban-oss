import Link from 'next/link'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { NoPermission } from '@/components/staff/NoPermission'
import {
  clearHref,
  pageHref,
  type RawSearchParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import type { RangeCounts } from '@/features/payments/entryList'
import { entryChipGroups } from '@/features/payments/entryListChips'
import {
  ENTRY_FILTER_PARAMS,
  ENTRY_PAGE_SIZE,
  ENTRY_RANGE_PARAM,
  ENTRY_SORT,
  type EntryRange,
  PAYMENTS_PATH,
  readEntriesView,
} from '@/features/payments/entryListParams'
import { readFlaggedOffsets } from '@/features/payments/flaggedAttempts'
import { entryTypeLabel, methodLabel } from '@/features/payments/labels'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'
import { EntryTable } from './EntryTable'
import { PaymentAlerts } from './PaymentAlerts'

export const dynamic = 'force-dynamic'

function rangeTabs(params: TableParams, counts: RangeCounts) {
  return filterTabs(PAYMENTS_PATH, params, {
    param: ENTRY_RANGE_PARAM,
    label: 'Entry lists',
    defaultTab: 'today',
    options: [
      { value: 'today', label: 'Today', count: counts.today },
      { value: 'week', label: 'This week', count: counts.week },
      { value: 'all', label: 'All', count: counts.all },
    ],
  })
}

const EMPTY_TEXT: Record<EntryRange, string> = {
  today: 'No money has moved today.',
  week: 'No money has moved this week.',
  all: 'No money has been recorded yet.',
}

function EmptyEntries({
  range,
  filtered,
  counterOpen,
}: {
  range: EntryRange
  filtered: boolean
  counterOpen: boolean
}) {
  if (filtered) return <p className="px-5 py-8">No entries match these filters.</p>
  return (
    <p className="px-5 py-8">
      {EMPTY_TEXT[range]}{' '}
      {counterOpen ? (
        <>
          Record one at the <Link href="/staff/counter">counter</Link>.
        </>
      ) : null}
    </p>
  )
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters, range, offset } = readEntriesView(await searchParams)
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const result = await loadPaymentsOverview(
    ctx.db,
    ctx.actor,
    {
      date: today,
      entries: { filters, sort, range, offset, limit: ENTRY_PAGE_SIZE },
      flagged: readFlaggedOffsets(params),
    },
    ctx.signal,
  )
  if (!result.ok) return <NoPermission title="Payments" action="view payments" />
  const { entries, entryFacets, rangeCounts, entryPage } = result.value
  const viewer = await loadNavViewer(ctx.db, ctx.actor, ctx.signal)
  const links = sortLinks(PAYMENTS_PATH, params, ENTRY_SORT, sort)
  const clear = clearHref(PAYMENTS_PATH, params, ENTRY_FILTER_PARAMS)
  const pageLink = (to: number | null) =>
    to === null ? null : pageHref(PAYMENTS_PATH, params, String(to))
  return (
    <main data-wide="">
      <h1>Payments</h1>
      <PaymentAlerts overview={result.value} params={params} />
      <section aria-label="Entries">
        <h2>Entries</h2>
        <p className="text-muted-foreground">
          {`Newest first. Click a column heading to sort. Today is ${formatCivilDate(today)}.`}
        </p>
        <FilterTabs label="Entry lists" tabs={rangeTabs(params, rangeCounts)} />
        <div className="toolbar my-3">
          <QuickFilters
            label="Quick filters"
            groups={entryChipGroups(params, entryFacets)}
            clearHref={clear}
          />
        </div>
        <div className="table-panel my-3">
          {entries.length === 0 ? (
            <EmptyEntries
              range={range}
              filtered={clear !== null}
              counterOpen={mayOpen('/staff/counter', viewer)}
            />
          ) : (
            <EntryTable entries={entries} links={links} />
          )}
        </div>
        <TablePager
          offset={entryPage.offset}
          shown={entries.length}
          total={entryPage.total}
          prevHref={pageLink(entryPage.prevOffset)}
          nextHref={pageLink(entryPage.nextOffset)}
        />
        <p>
          <Link href="/staff/reports/cash-receipts">Daily cash receipts report</Link>
        </p>
      </section>
    </main>
  )
}
