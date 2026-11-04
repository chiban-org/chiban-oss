import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import type { SortLink } from '@/features/dataTable/sort'
import type { EntrySortKey } from '@/features/payments/entryListParams'
import { entryTypeLabel, methodLabel } from '@/features/payments/labels'
import type { PaymentsOverview } from '@/features/payments/overview'
import { formatCents } from '@/lib/money'

export function EntryTable({
  entries,
  links,
}: {
  entries: PaymentsOverview['entries']
  links: Record<EntrySortKey, SortLink>
}) {
  return (
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
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{`${entryTypeLabel(e.entryType)}, ${methodLabel(e.method).toLowerCase()}`}</td>
            <td className="text-right tabular-nums">{formatCents(e.amountCents)}</td>
            <td>{e.payerName}</td>
            <td>{e.applicationNumbers.join(', ')}</td>
            <td>
              {e.receiptId === null ? null : (
                <Link href={`/staff/receipts/${e.receiptId}`} className="text-action underline">
                  {`Receipt ${e.receiptNumber ?? ''}`}
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
