export function signInFailureMessage(codeSubmitted: boolean): string {
  return codeSubmitted
    ? 'Email, password, or code is incorrect.'
    : 'Email or password is incorrect.'
}
