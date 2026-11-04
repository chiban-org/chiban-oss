const COPY: ReadonlyMap<string, string> = new Map(
  Object.entries({
    forbidden: 'You do not have permission to manage staff accounts.',
    not_found: 'That staff account was not found.',
    invalid_input: 'Enter a name and a valid email address.',
    invalid_roles: 'Choose at least one staff role.',
    email_taken: 'That email address already has an account.',
    not_invited: 'This account is not waiting on an invite.',
    last_admin:
      'At least one active administrator must remain. Make someone else an administrator first.',
    reason_required: 'Enter the reason for disabling this account.',
    self: 'You cannot disable your own account.',
    already_disabled: 'This account is already disabled.',
    not_disabled: 'This account is not disabled.',
    no_authenticator: 'This person has no authenticator set up.',
    not_active: 'Only an active account can be sent a password reset link.',
  }),
)

export function userErrorCopy(code: string): string {
  return COPY.get(code) ?? 'Something went wrong. Try again.'
}

export function unsentCopy(what: string): string {
  return `${what} The email could not be sent. Check the mail settings on the Health page, then send it again.`
}
