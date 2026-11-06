import type { z } from 'zod'
import type { CounterOutcome, FieldErrors, ReaderStatus } from '@/components/counter/counterTypes'
import type { Actor } from '@/features/auth/actor'
import type { QuickIssueError } from '@/features/counter/quickIssue'
import { guardAction } from '@/server/actionGuard'
import { errorCopy } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'

const ACTION_TIMEOUT_MS = 30_000

export interface CounterContext {
  actor: Actor
  signal: AbortSignal
}

export const failOutcome = (error: string, fieldErrors?: FieldErrors): CounterOutcome => ({
  ok: false,
  error,
  ...(fieldErrors === undefined ? {} : { fieldErrors }),
})

export const failReader = (error: string): ReaderStatus => ({ ok: false, error })

export async function guarded<T extends { ok: boolean }>(
  formData: FormData,
  fail: (error: string) => T,
  fn: (ctx: CounterContext) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return fail(errorCopy(guard.error))
  if (guard.value?.kind !== 'staff') return fail(errorCopy('signed_out'))
  return await fn({ actor: guard.value, signal })
}

export async function guardedForm<S extends z.ZodType, T extends { ok: boolean }>(
  formData: FormData,
  schema: S,
  fail: (error: string) => T,
  fn: (ctx: CounterContext, input: z.output<S>) => Promise<T>,
): Promise<T> {
  return await guarded(formData, fail, async (ctx) => {
    const parsed = parseForm(schema, formData)
    return parsed.ok ? await fn(ctx, parsed.value) : fail(parsed.error.error)
  })
}

export function copyFor(error: QuickIssueError | 'not_simulated'): string {
  if (typeof error === 'string') {
    return error === 'not_simulated' ? 'This reader is not simulated.' : errorCopy(error)
  }
  if ('fieldErrors' in error) {
    return `Check these fields: ${error.fieldErrors.map((f) => f.field.replaceAll('_', ' ')).join(', ')}.`
  }
  if ('gateBlocked' in error) {
    const reasons = error.gateBlocked
      .filter((g) => g.effective === 'blocked' && g.outcome.status !== 'pass')
      .map((g) => (g.outcome.status === 'pass' ? '' : g.outcome.reason))
    return `Not issued. ${reasons.join(' ')}`
  }
  return `The card processor reported a problem: ${error.detail}`
}
