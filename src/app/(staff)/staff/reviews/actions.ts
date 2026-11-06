'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NOTE_MAX_LENGTH } from '@/features/applications/noteLimits'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { recordId, requiredText } from '@/features/input/schemas'
import {
  addReviewComment,
  assignReviewer,
  removeReviewer,
  signOffReview,
} from '@/features/reviews/assignments'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'

const COPY = {
  forbidden: errorCopy('forbidden'),
  not_a_reviewer: 'That person does not have the reviewer role.',
  not_found: errorCopy('not_found'),
  already_signed_off: errorCopy('already_signed_off'),
  application_closed: boardErrorCopy('application_closed'),
} as const

const ASSIGN_FORM = z.object({
  applicationId: recordId('an application'),
  reviewerUserId: recordId('a reviewer'),
})

const REMOVE_FORM = z.object({ assignmentId: recordId('an assignment') })

const COMMENT_FORM = z.object({
  assignmentId: recordId('an assignment'),
  body: requiredText('a comment', { max: NOTE_MAX_LENGTH }),
})

export async function assignReviewerAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ASSIGN_FORM, async ({ db, actor, signal }, input) => {
    const result = await assignReviewer(db, actor, input, signal)
    if (!result.ok) {
      return result.error === 'not_a_reviewer'
        ? refuseField('reviewerUserId', COPY.not_a_reviewer)
        : { ok: false, error: COPY[result.error] }
    }
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
  return await runStaffForm(formData, REMOVE_FORM, async ({ db, actor, signal }, input) => {
    const result = await removeReviewer(db, actor, input, signal)
    return result.ok
      ? { ok: true, message: 'Reviewer removed.' }
      : { ok: false, error: COPY[result.error] }
  })
}

export async function addReviewCommentAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, COMMENT_FORM, async ({ db, actor, signal }, input) => {
    const result = await addReviewComment(db, actor, input, signal)
    return result.ok
      ? { ok: true, message: 'Comment added.' }
      : { ok: false, error: COPY[result.error] }
  })
}

export async function signOffReviewAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REMOVE_FORM, async ({ db, actor, signal }, input) => {
    const result = await signOffReview(db, actor, input, signal)
    return result.ok
      ? { ok: true, message: 'Review signed off.' }
      : { ok: false, error: COPY[result.error] }
  })
}
