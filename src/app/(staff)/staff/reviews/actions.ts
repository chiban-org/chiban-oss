'use server'

import { revalidatePath } from 'next/cache'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import {
  addReviewComment,
  assignReviewer,
  removeReviewer,
  signOffReview,
} from '@/features/reviews/assignments'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const COPY = {
  forbidden: errorCopy('forbidden'),
  not_a_reviewer: 'That person does not have the reviewer role.',
  not_found: errorCopy('not_found'),
  already_signed_off: errorCopy('already_signed_off'),
  application_closed: boardErrorCopy('application_closed'),
} as const

const invalid = (): ActionResult => ({ ok: false, error: errorCopy('invalid_input') })

export async function assignReviewerAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    const reviewerUserId = text(formData, 'reviewerUserId')
    if (!isUuid(applicationId) || !isUuid(reviewerUserId)) return invalid()
    const result = await assignReviewer(db, actor, { applicationId, reviewerUserId }, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    revalidatePath('/staff/applications')
    return {
      ok: true,
      message: result.value.alreadyAssigned
        ? 'That reviewer is already assigned.'
        : 'Reviewer assigned.',
    }
  })
}

export async function removeReviewerAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const assignmentId = text(formData, 'assignmentId')
    if (!isUuid(assignmentId)) return invalid()
    const result = await removeReviewer(db, actor, { assignmentId }, signal)
    return result.ok
      ? { ok: true, message: 'Reviewer removed.' }
      : { ok: false, error: COPY[result.error] }
  })
}

export async function addReviewCommentAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const assignmentId = text(formData, 'assignmentId')
    const body = text(formData, 'body')
    if (!isUuid(assignmentId) || body === '') return invalid()
    const result = await addReviewComment(db, actor, { assignmentId, body }, signal)
    return result.ok
      ? { ok: true, message: 'Comment added.' }
      : { ok: false, error: COPY[result.error] }
  })
}

export async function signOffReviewAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const assignmentId = text(formData, 'assignmentId')
    if (!isUuid(assignmentId)) return invalid()
    const result = await signOffReview(db, actor, { assignmentId }, signal)
    return result.ok
      ? { ok: true, message: 'Review signed off.' }
      : { ok: false, error: COPY[result.error] }
  })
}
