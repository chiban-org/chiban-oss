import { createHash } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { anonymousIntakeProbeTokens } from '@/db/schema'

export const hashProbeToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function isLiveProbeToken(
  db: Db,
  header: string | null,
  now: Date,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  if (header === null || header === '') return false
  const hash = hashProbeToken(header)
  const [row] = await db
    .select({ hash: anonymousIntakeProbeTokens.tokenHash })
    .from(anonymousIntakeProbeTokens)
    .where(
      and(
        eq(anonymousIntakeProbeTokens.tokenHash, hash),
        gt(anonymousIntakeProbeTokens.expiresAt, now),
      ),
    )
  return row !== undefined
}
