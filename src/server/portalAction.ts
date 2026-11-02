import { revalidatePath } from 'next/cache'
import type { Db } from '@/db/client'
import { db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { guardAction } from '@/server/actionGuard'
import { errorCopy } from '@/server/actionRunner'

const ACTION_TIMEOUT_MS = 30_000

export interface PortalActionContext {
  db: Db
  actor: Actor
  signal: AbortSignal
}

export async function withPortalActor<T extends { ok: boolean }>(
  formData: FormData,
  fail: (error: string) => T,
  fn: (ctx: PortalActionContext) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return fail(errorCopy(guard.error))
  if (guard.value === null) return fail(errorCopy('signed_out'))
  const result = await fn({ db, actor: guard.value, signal })
  if (result.ok) revalidatePath('/portal', 'layout')
  return result
}
