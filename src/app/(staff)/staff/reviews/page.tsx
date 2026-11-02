import Link from 'next/link'
import { listMyAssignments } from '@/features/reviews/reviewerView'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  const ctx = await requireStaffContext()
  const mine = await listMyAssignments(ctx.db, ctx.actor, ctx.signal)
  return (
    <main>
      <h1>Your reviews</h1>
      {mine.length === 0 ? (
        <p>No applications are assigned to you.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((a) => (
            <li key={a.assignmentId}>
              <Link href={`/staff/reviews/${a.assignmentId}`} className="text-action underline">
                {a.number}
              </Link>
              <span className="ml-2">{a.status.replaceAll('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
