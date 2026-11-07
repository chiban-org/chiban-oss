'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NOTE_MAX_LENGTH } from '@/features/applications/noteLimits'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { recordId, requiredText } from '@/features/input/schemas'
import { addReviewComment } from '@/features/reviews/assignments'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

const COMMENT_FORM = z.object({
  assignmentId: recordId('an assignment'),
  body: requiredText('a comment', { max: NOTE_MAX_LENGTH }),
})

const COPY = {
  forbidden: 'This application is no longer with your board for comment.',
  already_signed_off: errorCopy('already_signed_off'),
  application_closed: boardErrorCopy('application_closed'),
} as const

const fail = (error: string): ActionResult => ({ ok: false, error })

export async function postBoardCommentAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(COMMENT_FORM, formData)
    if (!parsed.ok) return parsed.error
    const posted = await addReviewComment(db, actor, parsed.value, signal)
    if (!posted.ok) return fail(COPY[posted.error])
    revalidatePath('/board', 'layout')
    return { ok: true, message: 'Comment posted. The land use office can read it now.' }
  })
}
