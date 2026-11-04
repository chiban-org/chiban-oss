import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { entryChipGroups } from '@/features/payments/entryListChips'
import {
  ENTRY_FILTER_PARAMS,
  ENTRY_SORT,
  PAYMENTS_PATH,
  readEntriesView,
} from '@/features/payments/entryListParams'
import { entryTypeLabel, methodLabel } from '@/features/payments/labels'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'
import { PaymentAlerts } from './PaymentAlerts'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readEntriesView(await searchParams)
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const result = await loadPaymentsOverview(
    ctx.db,
    ctx.actor,
    { date: today, entries: { filters, sort } },
    ctx.signal,
  )
  if (!result.ok) return <NoPermission title="Payments" action="view payments" />
  const { todaysEntries, entryFacets } = result.value
  const links = sortLinks(PAYMENTS_PATH, params, ENTRY_SORT, sort)
  const clear = clearHref(PAYMENTS_PATH, params, ENTRY_FILTER_PARAMS)
  return (
    <main data-wide="">
      <h1>Payments</h1>
      <PaymentAlerts overview={result.value} />
      <section aria-label="Today">
        <h2>{`Entries for ${formatCivilDate(today)}`}</h2>
        <div className="toolbar my-3">
          <QuickFilters
            label="Quick filters"
            groups={entryChipGroups(params, entryFacets)}
            clearHref={clear}
          />
        </div>
        {todaysEntries.length === 0 ? (
          <p>{clear === null ? 'No money has moved today.' : 'No entries match these filters.'}</p>
        ) : (
          <>
            <p className="text-muted-foreground">Newest first. Click a column heading to sort.</p>
            <div className="table-panel my-3">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr>
                    <SortHeader label="Entry" link={links.entry} />
                    <SortHeader label="Amount" link={links.amount} className="text-right" />
                    <SortHeader label="Payer" link={links.payer} />
                    <SortHeader label="Application" link={links.application} />
                    <SortHeader label="Receipt" link={links.receipt} />
                  </tr>
                </thead>
                <tbody>
                  {todaysEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{`${entryTypeLabel(e.entryType)}, ${methodLabel(e.method).toLowerCase()}`}</td>
                      <td className="text-right tabular-nums">{formatCents(e.amountCents)}</td>
                      <td>{e.payerName}</td>
                      <td>{e.applicationNumbers.join(', ')}</td>
                      <td>
                        {e.receiptId === null ? null : (
                          <Link
                            href={`/staff/receipts/${e.receiptId}`}
                            className="text-action underline"
                          >
                            {`Receipt ${e.receiptNumber ?? ''}`}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p>
          <Link href="/staff/reports/cash-receipts" className="text-action underline">
            Daily cash receipts report
          </Link>
        </p>
      </section>
    </main>
  )
}
