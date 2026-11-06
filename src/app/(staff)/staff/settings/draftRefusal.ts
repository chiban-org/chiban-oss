import type { ConfigIssue } from '@/features/config/kinds'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { errorCopy } from '@/server/actionRunner'
import type { ActionFailure } from '@/server/formInput'

export function refusedDraft(error: 'forbidden' | { invalid: ConfigIssue[] }): ActionFailure {
  const fieldErrors = fieldErrorsFor(error)
  if (error === 'forbidden') return { ok: false, error: errorCopy('forbidden'), fieldErrors }
  return { ok: false, error: 'The draft has errors.', fieldErrors }
}
