import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
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
  if (!result.ok) {
    return (
      <main data-wide="">
        <h1>Payments</h1>
        <p role="alert">You do not have permission to view payments.</p>
      </main>
    )
  }
  const { unknownAttempts, anomalies, overpayments, todaysEntries, entryFacets } = result.value
  const links = sortLinks(PAYMENTS_PATH, params, ENTRY_SORT, sort)
  const clear = clearHref(PAYMENTS_PATH, params, ENTRY_FILTER_PARAMS)
  return (
    <main data-wide="">
      <h1>Payments</h1>
      <section aria-label="Outcome unknown">
        <h2>Card payments with an unknown outcome</h2>
        {unknownAttempts.length === 0 ? <p>None.</p> : null}
        <ul className="space-y-2">
          {unknownAttempts.map((a) => (
            <li key={a.id}>
              <StatusChip status="overdue" label="Outcome unknown" />{' '}
              <Link href={`/staff/payments/${a.id}`} className="text-action underline">
                {`${formatCents(a.amountCents)} from ${a.payerName}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Anomalies">
        <h2>Anomalies</h2>
        {anomalies.length === 0 ? <p>None.</p> : null}
        <ul className="space-y-2">
          {anomalies.map((a) => (
            <li key={a.id}>
              <StatusChip
                status="failed"
                label={`Anomaly: ${(a.anomaly ?? '').replaceAll('_', ' ')}`}
              />{' '}
              <Link href={`/staff/payments/${a.id}`} className="text-action underline">
                {`${formatCents(a.amountCents)} from ${a.payerName}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Overpayments">
        <h2>Overpayment to refund</h2>
        {overpayments.length === 0 ? <p>None.</p> : null}
        <ul className="space-y-2">
          {overpayments.map((o) => (
            <li key={o.applicationId}>
              <StatusChip status="overdue" label="Overpayment to refund" />{' '}
              <Link
                href={`/staff/applications/${o.applicationId}`}
                className="text-action underline"
              >
                {`${o.applicationNumber}: ${formatCents(o.amountCents)}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
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
