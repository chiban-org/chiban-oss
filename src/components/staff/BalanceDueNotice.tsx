import Link from 'next/link'
import type { ReturnedCheckNotice } from '@/features/ledger/balanceNotice'
import { formatCents } from '@/lib/money'

interface BalanceDueNoticeProps {
  notices: ReturnedCheckNotice[]
  linkApplications?: boolean
}

export function BalanceDueNotice({ notices, linkApplications = false }: BalanceDueNoticeProps) {
  if (notices.length === 0) return null
  return (
    <div role="status" className="my-3 space-y-1 rounded-md bg-highlight px-3 py-2 font-semibold">
      {notices.map((n) => (
        <p key={n.applicationId}>
          {`Balance due ${formatCents(n.dueCents)} (returned check)`}
          {linkApplications ? (
            <>
              {'. '}
              <Link href={`/staff/applications/${n.applicationId}`}>{n.number}</Link>
            </>
          ) : null}
        </p>
      ))}
    </div>
  )
}
