'use server'

import { z } from 'zod'
import type { AddressSuggestion } from '@/features/address/suggestionLayout'
import { addressSuggester } from '@/features/usps/uspsRuntime'
import { guardAction } from '@/server/actionGuard'

const REQUEST_TIMEOUT_MS = 10_000

const InputSchema = z.object({
  csrfToken: z.string(),
  lines: z.array(z.string().max(300)).min(1).max(6),
})

export async function suggestAddress(input: unknown): Promise<AddressSuggestion | null> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return null
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  try {
    const guard = await guardAction({ csrfToken: parsed.data.csrfToken }, signal)
    if (!guard.ok || guard.value === null) return null
    const found = await addressSuggester.suggest(parsed.data.lines, guard.value.userId, signal)
    return found === null ? null : { lines: [...found.lines], matches: found.matches }
  } catch {
    return null
  }
}
