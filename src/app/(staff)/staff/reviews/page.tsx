import { AssignmentList } from '@/components/reviews/AssignmentList'
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
        <AssignmentList assignments={mine} />
      )}
    </main>
  )
}
