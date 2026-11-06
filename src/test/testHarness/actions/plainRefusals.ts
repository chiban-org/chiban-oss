import type { Refusals } from './cases'
import { PORTAL_REFUSALS } from './refusals'

export function plainPortalRefusals<R extends { ok: boolean }>(): Refusals<R> {
  return PORTAL_REFUSALS as unknown as Refusals<R>
}
