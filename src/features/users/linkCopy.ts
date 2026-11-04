import type { CompleteError, LinkPurpose } from '@/features/users/links'

export type DeadLink = Exclude<CompleteError, 'weak_password'>

export function deadLinkCopy(state: DeadLink, purpose: LinkPurpose | null): string {
  const what = purpose === 'password_reset' ? 'password reset link' : 'invite link'
  switch (state) {
    case 'expired':
      return purpose === 'password_reset'
        ? 'This password reset link has expired. Ask your administrator to send a new one.'
        : 'This invite link has expired. Ask your administrator to send a new invite.'
    case 'used':
      return `This ${what} has already been used. Sign in with the password you chose.`
    case 'revoked':
      return `This ${what} no longer works. A newer link may have been sent, or the account was disabled. Ask your administrator.`
    case 'invalid':
      return 'This link is not valid. Check that you opened the whole link from the email, or ask your administrator for a new one.'
  }
}

export function setPasswordTitle(purpose: LinkPurpose | null): string {
  return purpose === 'password_reset' ? 'Set a new password' : 'Choose your password'
}
