import type { Metadata } from 'next'
import Link from 'next/link'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { TablePager } from '@/components/dataTable/TablePager'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadAccountView } from '@/features/contractors/accountView'
import { listContractorProjects } from '@/features/contractors/dashboard'
import {
  readSearch,
  readTab,
  SEARCH_PARAM,
  TAB_LABELS,
  TAB_PARAM,
} from '@/features/contractors/dashboardTabs'
import {
  firstParam,
  PAGE_PARAM,
  pageHref,
  type RawSearchParams,
  readTableParams,
} from '@/features/dataTable/params'
import { filterTabs, labeledOptions } from '@/features/dataTable/quickFilters'
import { requirePortalContext } from '@/server/requirePortal'
import { NeedsYou } from './NeedsYou'
import { ProjectRow } from './ProjectRow'

export const metadata: Metadata = { title: 'Your contractor projects' }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const PATH = '/portal/contractor'
const LINK = 'tap-target inline-flex items-center'

function EmptyState({ email, filtered }: { email: string | null; filtered: boolean }) {
  if (filtered) {
    return (
      <p>
        {'Nothing matches. '}
        <Link href={PATH} className={LINK}>
          Clear the search and filter
        </Link>
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p>
        {email === null
          ? 'No projects name you as the contractor yet.'
          : `No projects name ${email} as the contractor yet.`}
      </p>
      <p>
        {
          'Give the town the email this account uses, and the project shows here once the town records it. Or '
        }
        <Link href="/portal/apply" className={LINK}>
          start an application
        </Link>
        {' yourself.'}
      </p>
    </div>
  )
}

export default async function ContractorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const params = readTableParams(await searchParams)
  const tab = readTab(params)
  const q = readSearch(params)
  const cursor = firstParam(params, PAGE_PARAM)
  const ctx = await requirePortalContext(PATH)
  const [dashboard, account] = await Promise.all([
    listContractorProjects(
      ctx.db,
      ctx.actor,
      { limit: PAGE_SIZE, tab, q, ...(cursor === undefined ? {} : { cursor }) },
      ctx.signal,
    ),
    loadAccountView(ctx.db, ctx.actor.userId, ctx.signal),
  ])
  const tabs = filterTabs(PATH, params, {
    param: TAB_PARAM,
    label: 'Status',
    defaultTab: 'all',
    options: labeledOptions(TAB_LABELS, new Map(Object.entries(dashboard.counts))),
  })
  const everything = dashboard.counts.all
  const filtered = tab !== 'all' || q !== ''
  return (
    <main>
      <PageHeader
        title="Your contractor projects"
        lead="Projects that name you as the contractor, with what each one needs from you."
        actions={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Button asChild className="no-underline">
              <Link href="/portal/apply">Start an application</Link>
            </Button>
            <Link href="/account" className={LINK}>
              Your contractor profile
            </Link>
          </div>
        }
      />
      <NeedsYou needs={dashboard.needs} />
      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading">Projects</h2>
        {everything === 0 && !filtered ? (
          <EmptyState email={account?.email ?? null} filtered={false} />
        ) : (
          <>
            <FilterTabs label="Status" tabs={tabs} />
            <form
              method="get"
              role="search"
              aria-label="Search projects"
              className="mb-4 flex flex-wrap items-center gap-2"
            >
              {tab === 'all' ? null : <input type="hidden" name={TAB_PARAM} value={tab} />}
              <Label htmlFor="project-search" className="sr-only">
                Search by address or number
              </Label>
              <Input
                id="project-search"
                type="search"
                name={SEARCH_PARAM}
                defaultValue={q}
                placeholder="Search by address or number"
                className="w-72 max-w-full"
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            {dashboard.rows.length === 0 ? (
              <EmptyState email={account?.email ?? null} filtered={filtered} />
            ) : (
              <ul className="flex list-none flex-col gap-4 p-0">
                {dashboard.rows.map((row) => (
                  <ProjectRow key={row.projectId} row={row} />
                ))}
              </ul>
            )}
            <TablePager
              offset={dashboard.offset}
              shown={dashboard.rows.length}
              total={dashboard.total}
              prevHref={
                dashboard.prevCursor === null ? null : pageHref(PATH, params, dashboard.prevCursor)
              }
              nextHref={
                dashboard.nextCursor === null ? null : pageHref(PATH, params, dashboard.nextCursor)
              }
            />
          </>
        )}
      </section>
    </main>
  )
}
