'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NOTE_MAX_LENGTH } from '@/features/applications/noteLimits'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { optionalCivilDate, recordId, requiredText } from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import {
  addReviewComment,
  assignReviewer,
  removeReviewer,
  signOffReview,
} from '@/features/reviews/assignments'
import { assignBoardForComment, withdrawBoardAssignment } from '@/features/reviews/boardAssignments'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'

const COPY = {
  forbidden: errorCopy('forbidden'),
  not_a_reviewer: 'That person does not have the reviewer role.',
  not_found: errorCopy('not_found'),
  already_signed_off: errorCopy('already_signed_off'),
  application_closed: boardErrorCopy('application_closed'),
  board_not_assignable: 'Choose an active board that is not deciding this application.',
} as const

const ASSIGN_FORM = z.object({
  applicationId: recordId('an application'),
  reviewerUserId: recordId('a reviewer'),
})

const REMOVE_FORM = z.object({ assignmentId: recordId('an assignment') })

const SEND_TO_BOARD_FORM = z.object({
  applicationId: recordId('an application'),
  boardId: recordId('a board'),
  commentBy: optionalCivilDate('the comment-by date'),
})

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

function emailedText(sent: { emailed: number; unsent: number }): string {
  const emailed =
    sent.emailed === 1 ? '1 member was emailed.' : `${sent.emailed} members were emailed.`
  if (sent.unsent === 0) return emailed
  return `${emailed} The email to ${sent.unsent} could not be sent.`
}

export async function sendToBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SEND_TO_BOARD_FORM, async ({ db, actor, signal }, input) => {
    const result = await assignBoardForComment(db, getMailTransport(), actor, input, signal)
    if (!result.ok) {
      return result.error === 'board_not_assignable'
        ? refuseField('boardId', COPY.board_not_assignable)
        : { ok: false, error: COPY[result.error] }
    }
    revalidatePath('/board')
    return {
      ok: true,
      message: result.value.alreadyAssigned
        ? 'That board already has this application for comment.'
        : `Sent to the board for comment. ${emailedText(result.value)}`,
    }
  })
}

export async function withdrawBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REMOVE_FORM, async ({ db, actor, signal }, input) => {
    const result = await withdrawBoardAssignment(db, actor, input, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    revalidatePath('/board')
    return { ok: true, message: 'Request for comment withdrawn.' }
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
