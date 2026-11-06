'use server'

import { BoardSchema } from '@packs/nh/schema'
import { z } from 'zod'
import { errorOrOk } from '@/features/boards/actionResult'
import { updateBoardMember } from '@/features/boards/memberEdit'
import { endMembership, inviteBoardMember, type MemberTitle } from '@/features/boards/members'
import {
  choice,
  civilDate,
  emailAddress,
  endNotBefore,
  optionalCivilDate,
  optionalText,
} from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const TITLES = [
  'chair',
  'vice_chair',
  'member',
  'alternate',
  'clerk',
] as const satisfies readonly MemberTitle[]

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

const TERM_ORDER_COPY = 'The term cannot end before it starts.'

const INVITE_FORM = z
  .object({
    displayName: optionalText('a name', { max: 200 }),
    email: emailAddress('an email address'),
    board: choice('a board', BoardSchema.options),
    title: choice('a role on the board', TITLES),
    termStart: civilDate('the term start date'),
    termEnd: optionalCivilDate('the term end date'),
  })
  .superRefine(endNotBefore('termStart', 'termEnd', TERM_ORDER_COPY))

export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, INVITE_FORM, async ({ db, actor, signal }, input) => {
    const { termEnd, displayName, ...rest } = input
    const invited = await inviteBoardMember(
      db,
      getMailTransport(),
      actor,
      {
        ...rest,
        displayName: displayName ?? input.email,
        ...(termEnd === null ? {} : { termEnd }),
      },
      signal,
    )
    if (!invited.ok && invited.error === 'term_order')
      return refuseField('termEnd', TERM_ORDER_COPY)
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
