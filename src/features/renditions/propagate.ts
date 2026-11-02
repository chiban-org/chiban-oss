import type { Tx } from '@/db/client'

export async function onApprovalRevoked(
  _tx: Tx,
  input: { versionId: string; revokedAt: Date },
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  await Promise.resolve(input)
}
