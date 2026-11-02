import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appeals } from '@/db/schema'
import { registerGate } from '@/features/gates/registry'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'

export const APPEAL_SUSPENSION_GATE_KEY = 'nh.appeal.suspension'

const SUSPENDING_EFFECT: string = 'suspend_on_appeal_of_issuance'

export function appealSuspends(pack: Pack, bindings: ReadonlySet<string>): boolean {
  return pack.rules.some(
    (r) => r.kind === 'effect' && r.effect === SUSPENDING_EFFECT && bindings.has(r.key),
  )
}

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

const effect = ruleByKey(loadPack(), APPEAL_SUSPENSION_GATE_KEY)

registerGate({
  key: effect.key,
  label: effect.label,
  citation: effect.citation,
  kind: 'statutory',
  appliesTo: ['closed'],
  boundBy: effect.key,
  evaluate: async (tx, app, _today, signal) =>
    (await isSuspended(tx, app.id, signal))
      ? { status: 'blocked', reason: 'Suspended by appeal (RSA 676:6). Resolve the appeal first.' }
      : { status: 'pass' },
})
