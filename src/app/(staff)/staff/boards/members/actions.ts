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
  recordId,
  requiredText,
} from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { errorOrField } from '../formFields'

const TITLES = [
  'chair',
  'vice_chair',
  'member',
  'alternate',
  'clerk',
] as const satisfies readonly MemberTitle[]

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

const END_FORM = z.object({ membershipId: recordId('a membership') })

export async function endMembershipAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, END_FORM, async ({ db, actor, signal }, input) =>
    errorOrOk(
      await endMembership(db, actor, input.membershipId, signal),
      'Membership ended. Access stops now.',
    ),
  )
}

const UPDATE_FORM = z
  .object({
    membershipId: recordId('a membership'),
    displayName: requiredText('a name', { max: 200 }),
    email: emailAddress('an email address'),
    board: choice('a board', BoardSchema.options),
    title: choice('a role on the board', TITLES),
    termStart: civilDate('the term start date'),
    termEnd: optionalCivilDate('the term end date'),
  })
  .superRefine(endNotBefore('termStart', 'termEnd', TERM_ORDER_COPY))

const UPDATE_FIELD: Record<string, string> = {
  name_required: 'displayName',
  email_taken: 'email',
  staff_account: 'email',
  term_order: 'termEnd',
}

export async function updateMemberAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, UPDATE_FORM, async ({ db, actor, signal }, input) => {
    const { termEnd, ...rest } = input
    const saved = await updateBoardMember(db, actor, { ...rest, termEnd }, signal)
    return errorOrField(saved, 'Member saved.', UPDATE_FIELD)
  })
}
