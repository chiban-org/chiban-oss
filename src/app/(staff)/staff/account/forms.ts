import { z } from 'zod'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { inputField, requiredText } from '@/features/input/schemas'
import { err, ok } from '@/types/result'

export const MAX_NAME_LENGTH = 120

function password(missing: string, minLength = 1) {
  return inputField((raw) => {
    const value = typeof raw === 'string' ? raw : ''
    if (value === '') return err(missing)
    if (value.length < minLength) return err(`Use at least ${minLength} characters.`)
    return ok(value)
  })
}

const sixDigits = inputField((raw) => {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return /^\d{6}$/.test(value) ? ok(value) : err('Enter the 6-digit code.')
})

export const CHANGE_NAME_FORM = z.object({
  displayName: requiredText('your name', { max: MAX_NAME_LENGTH }),
})

export const CHANGE_PASSWORD_FORM = z
  .object({
    current: password('Enter your current password.'),
    password: password('Enter a new password.', MIN_PASSWORD_LENGTH),
    confirm: password('Type the new password again.'),
  })
  .superRefine((value, ctx) => {
    if (value.confirm !== value.password) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirm'],
        message: 'The two new passwords do not match.',
      })
    }
  })

export const CONFIRM_TOTP_FORM = z.object({ code: sixDigits })

export const NO_FIELDS = z.object({})
