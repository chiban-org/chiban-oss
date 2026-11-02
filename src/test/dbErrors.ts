import { expect } from 'vitest'

export async function expectDbError(attempt: Promise<unknown>, pattern: RegExp): Promise<void> {
  const failure = await attempt.then(
    () => null,
    (e: unknown) => e,
  )
  expect(failure).not.toBeNull()
  const cause = (failure as { cause?: { message?: string } }).cause
  expect(cause?.message ?? (failure as Error).message).toMatch(pattern)
}
