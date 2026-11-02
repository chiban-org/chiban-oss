'use server'

import { BoardSchema } from '@packs/nh/schema'
import { errorOrOk } from '@/features/boards/actionResult'
import { endMembership, inviteBoardMember, type MemberTitle } from '@/features/boards/members'
import { getMailTransport } from '@/features/mail/transport'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { parseCivilDate } from '@/types/civilDate'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const TITLES: readonly MemberTitle[] = ['chair', 'vice_chair', 'member', 'alternate', 'clerk']

export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const board = BoardSchema.safeParse(text(formData, 'board'))
    const title = TITLES.find((t) => t === text(formData, 'title'))
    const termStart = parseCivilDate(text(formData, 'termStart'))
    const rawEnd = text(formData, 'termEnd')
    const termEnd = parseCivilDate(rawEnd)
    const email = text(formData, 'email')
    if (!board.success || title === undefined || !termStart.ok || email === '') return INVALID
    if (rawEnd !== '' && !termEnd.ok) return INVALID
    const invited = await inviteBoardMember(
      db,
      getMailTransport(),
      actor,
      {
        email,
        displayName: text(formData, 'displayName') || email,
        board: board.data,
        title,
        termStart: termStart.value,
        ...(rawEnd === '' || !termEnd.ok ? {} : { termEnd: termEnd.value }),
      },
      signal,
    )
    return errorOrOk(invited, 'Member added. They were emailed how to sign in.')
  })
}

export async function endMembershipAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const ended = await endMembership(db, actor, text(formData, 'membershipId'), signal)
    return errorOrOk(ended, 'Membership ended. Access stops now.')
  })
}
