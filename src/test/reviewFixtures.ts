import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { assignReviewer, signOffReview } from '@/features/reviews/assignments'

export async function signedOffReview(
  db: DbOrTx,
  people: { staff: Actor; reviewer: Actor },
  applicationId: string,
  signal: AbortSignal,
): Promise<void> {
  const assigned = await assignReviewer(
    db,
    people.staff,
    { applicationId, reviewerUserId: people.reviewer.userId },
    signal,
  )
  if (!assigned.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, 'Review not assigned', { error: assigned.error })
  await signOffReview(db, people.reviewer, { assignmentId: assigned.value.assignmentId }, signal)
}
