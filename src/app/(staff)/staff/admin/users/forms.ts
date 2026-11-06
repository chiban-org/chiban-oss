import { z } from 'zod'
import { emailAddress, inputField, recordId, requiredText } from '@/features/input/schemas'
import { MAX_REASON_LENGTH } from '@/features/users/manage'
import { ok } from '@/types/result'

export const MAX_DISPLAY_NAME_LENGTH = 120

function roleList() {
  return inputField((raw) => {
    const all = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
    return ok(all.filter((v): v is string => typeof v === 'string'))
  })
}

const userId = () => recordId('a person')

export const INVITE_FORM = z.object({
  displayName: requiredText('a name', { max: MAX_DISPLAY_NAME_LENGTH }),
  email: emailAddress('an email address'),
  roles: roleList(),
})

export const USER_FORM = z.object({ userId: userId() })

export const SET_ROLES_FORM = z.object({ userId: userId(), roles: roleList() })

export const DISABLE_FORM = z.object({
  userId: userId(),
  reason: requiredText('the reason for disabling this account', { max: MAX_REASON_LENGTH }),
})
