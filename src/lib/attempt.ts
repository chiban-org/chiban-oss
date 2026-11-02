export type Attempt<T> = { ok: true; value: T } | { ok: false; error: string }

export async function attempt<T>(
  fn: () => Promise<T>,
  setPending: (pending: boolean) => void,
): Promise<Attempt<T>> {
  setPending(true)
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
  } finally {
    setPending(false)
  }
}
