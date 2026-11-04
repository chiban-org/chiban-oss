'use server'

import { BoardSchema } from '@packs/nh/schema'
import { errorOrOk } from '@/features/boards/actionResult'
import { updateBoardMember } from '@/features/boards/memberEdit'
import { endMembership, inviteBoardMember, type MemberTitle } from '@/features/boards/members'
import { getMailTransport } from '@/features/mail/transport'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const TITLES: readonly MemberTitle[] = ['chair', 'vice_chair', 'member', 'alternate', 'clerk']

interface Seat {
  board: 'planning_board' | 'zba'
  title: MemberTitle
  termStart: CivilDate
  termEnd: CivilDate | null
}

function seatOf(formData: FormData): Seat | null {
  const board = BoardSchema.safeParse(text(formData, 'board'))
  const title = TITLES.find((t) => t === text(formData, 'title'))
  const termStart = parseCivilDate(text(formData, 'termStart'))
  const rawEnd = text(formData, 'termEnd')
  const termEnd = parseCivilDate(rawEnd)
  if (!board.success || title === undefined || !termStart.ok) return null
  if (rawEnd !== '' && !termEnd.ok) return null
  return {
    board: board.data,
    title,
    termStart: termStart.value,
    termEnd: rawEnd === '' || !termEnd.ok ? null : termEnd.value,
  }
}

export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const seat = seatOf(formData)
    const email = text(formData, 'email')
    if (seat === null || email === '') return INVALID
    const { termEnd, ...rest } = seat
    const invited = await inviteBoardMember(
      db,
      getMailTransport(),
      actor,
      {
        email,
        displayName: text(formData, 'displayName') || email,
        ...rest,
        ...(termEnd === null ? {} : { termEnd }),
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

export async function updateMemberAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const membershipId = text(formData, 'membershipId')
    const seat = seatOf(formData)
    if (!isUuid(membershipId) || seat === null) return INVALID
    const saved = await updateBoardMember(
      db,
      actor,
      {
        membershipId,
        displayName: text(formData, 'displayName'),
        email: text(formData, 'email'),
        ...seat,
      },
      signal,
    )
    return errorOrOk(saved, 'Member saved.')
  })
}
