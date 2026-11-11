import type { Metadata } from 'next'
import Link from 'next/link'
import { ListHeader } from '@/components/layout/ListHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadAdministrativeAppeals } from '@/features/appeals/adminAppeals'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { RecordDecision } from './RecordDecision'

export const metadata: Metadata = { title: 'Appeals of administrative decisions' }

export const dynamic = 'force-dynamic'

export default async function AdministrativeAppealsPage() {
  const ctx = await requireStaffContext()
  const lines = await loadAdministrativeAppeals(ctx.db, ctx.actor, ctx.signal)
  if (lines === null) {
    return <NoPermission title="Appeals of administrative decisions" action="work with appeals" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  return (
    <main>
      <ListHeader
        title="Appeals of administrative decisions"
        lead="Decisions by the building inspector, zoning administrator or another town official that can be appealed to the Zoning Board."
        actions={<RecordDecision today={today} />}
      />
      <div className="table-panel">
        {lines.length === 0 ? (
          <p className="px-5 py-8">
            No administrative decisions are recorded. Record one when someone may appeal it.
          </p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Administrative decisions</caption>
            <thead>
              <tr>
                <th scope="col">Application</th>
                <th scope="col">Type</th>
                <th scope="col">Decided</th>
                <th scope="col">Appeal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={`${line.applicationId}-${String(i)}`} className="align-top">
                  <td>
                    <Link
                      href={`/staff/boards/appeals/${line.applicationId}`}
                      className="font-semibold"
                    >
                      {line.applicationNumber}
                    </Link>
                  </td>
                  <td>{line.typeLabel}</td>
                  <td className="whitespace-nowrap">{line.decidedOnText}</td>
                  <td>{line.statusText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
