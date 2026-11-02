import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appeals } from '@/db/schema'
import { registerGate } from '@/features/gates/registry'

export const APPEAL_SUSPENSION_GATE_KEY = 'nh.appeal.suspension'

export async function isSuspended(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const open = await db
    .select({ id: appeals.id })
    .from(appeals)
    .where(and(eq(appeals.applicationId, applicationId), isNull(appeals.resolvedOn)))
    .limit(1)
  return open.length > 0
}

registerGate({
  key: APPEAL_SUSPENSION_GATE_KEY,
  kind: 'statutory',
  appliesTo: ['closed'],
  boundBy: APPEAL_SUSPENSION_GATE_KEY,
  evaluate: async (tx, app, _today, signal) =>
    (await isSuspended(tx, app.id, signal))
      ? { status: 'blocked', reason: 'Suspended by appeal (RSA 676:6). Resolve the appeal first.' }
      : { status: 'pass' },
})
