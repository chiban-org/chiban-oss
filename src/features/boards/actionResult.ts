import { boardErrorCopy } from '@/features/boards/errorCopy'
import type { ActionResult } from '@/server/actionRunner'

export function errorOrOk(
  result: { ok: true } | { ok: false; error: unknown },
  message: string,
): ActionResult {
  return result.ok ? { ok: true, message } : { ok: false, error: boardErrorCopy(result.error) }
}
