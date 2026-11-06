import type { Role } from '@/constants/roles'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import type { Refusals } from './cases'
import { isPublicRole } from './roles'

function refusal(code: string): ActionResult {
  return { ok: false, error: errorCopy(code) }
}

export const STAFF_REFUSALS: Refusals<ActionResult> = {
  csrf: refusal('csrf'),
  signedOut: refusal('signed_out'),
  forbidden: (role: Role) => refusal(isPublicRole(role) ? 'signed_out' : 'forbidden'),
  invalid: refusal('invalid_input'),
  checkOnly: refusal('check_unsupported'),
}

export const PORTAL_REFUSALS: Refusals<ActionResult> = {
  csrf: refusal('csrf'),
  signedOut: refusal('signed_out'),
  forbidden: refusal('forbidden'),
  invalid: refusal('invalid_input'),
  checkOnly: refusal('check_unsupported'),
}
