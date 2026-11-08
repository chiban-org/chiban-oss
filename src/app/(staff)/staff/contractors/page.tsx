import type { Metadata } from 'next'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { ListHeader } from '@/components/layout/ListHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { type DirectoryRow, listContractorDirectory } from '@/features/contractors/directory'
import {
  CONTRACTORS_PATH,
  DIRECTORY_SORT,
  readDirectoryView,
} from '@/features/contractors/directoryParams'
import { tradeLabel } from '@/features/contractors/trades'
import { pagerLinks } from '@/features/dataTable/pageSlice'
import type { RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { townTimeZone } from '@/features/town/timeZone'
import { formatInstantDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { ContractorSearch } from './ContractorSearch'

export const metadata: Metadata = { title: 'Contractors' }

export const dynamic = 'force-dynamic'

function licenseText(row: DirectoryRow): string {
  return row.licenses.map((l) => `${tradeLabel(l.trade)} ${l.number}`).join(', ')
}

function Row({ row, zone }: { row: DirectoryRow; zone: string }) {
  return (
    <tr>
      <td className="font-semibold">{row.companyName}</td>
      <td>
        <div>{row.contactName}</div>
        <div className="text-sm text-muted-foreground">
          {[row.email, row.phone].filter((v) => v !== null).join(', ')}
        </div>
      </td>
      <td>{row.trades.length === 0 ? 'None listed' : row.trades.map(tradeLabel).join(', ')}</td>
      <td>{licenseText(row)}</td>
      <td className="tabular-nums">{row.projects}</td>
      <td className="whitespace-nowrap">{formatInstantDate(row.lastActivity, zone)}</td>
    </tr>
  )
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const view = readDirectoryView(await searchParams)
  const ctx = await requireStaffContext()
  const page = await listContractorDirectory(ctx.db, ctx.actor, view, ctx.signal)
  if (page === null) return <NoPermission title="Contractors" action="see the contractor list" />
  const zone = await townTimeZone(ctx.db, ctx.signal)
  const links = sortLinks(CONTRACTORS_PATH, view.params, DIRECTORY_SORT, view.sort)
  return (
    <main data-wide="">
      <ListHeader
        title="Contractors"
        lead="Contractors who set up a profile in the portal. The town does not register or license contractors; check state licenses when a trade permit is pulled."
      />
      <div className="toolbar">
        <ContractorSearch q={view.q} />
      </div>
      <div className="table-panel">
        {page.rows.length === 0 ? (
          <p className="px-5 py-8">
            {view.q === '' ? 'No contractor has set up a profile yet.' : 'No contractors match.'}
          </p>
        ) : (
          <table className="w-full min-w-[56rem] text-left">
            <thead>
              <tr>
                <SortHeader label="Company" link={links.company} />
                <SortHeader label="Contact" link={links.contact} />
                <th scope="col">Trades</th>
                <th scope="col">License numbers</th>
                <SortHeader label="Projects" link={links.projects} />
                <SortHeader label="Last activity" link={links.activity} />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <Row key={row.userId} row={row} zone={zone} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TablePager {...pagerLinks(CONTRACTORS_PATH, view.params, page)} />
    </main>
  )
}
