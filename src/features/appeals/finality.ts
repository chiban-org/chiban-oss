import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appealNodes, clocks } from '@/db/schema'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export interface Finality {
  final: boolean
  finalOn: CivilDate | null
  appealPeriodEndsOn: CivilDate | null
  open: { nodeId: string; kind: string; due: CivilDate | null }[]
}

const DECISION_KINDS = [
  'zba_decision',
  'pb_decision',
  'administrative_decision',
  'rehearing_outcome',
]
const FINAL_DECISION_KINDS = ['zba_decision', 'pb_decision']
const APPROVING = ['approved', 'approved_with_conditions']

async function windowClocks(db: DbOrTx, applicationId: string) {
  const rows = await db
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        inArray(clocks.status, ['running', 'overdue', 'met', 'lapsed']),
      ),
    )
  const pack = loadPack()
  return rows.filter((c) => {
    const rule = ruleByKey(pack, c.ruleKey, c.ruleVersion)
    return rule.kind === 'clock' && rule.clockType === 'filing_window'
  })
}

export async function finality(
  db: DbOrTx,
  applicationId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Finality> {
  signal.throwIfAborted()
  const nodes = await db
    .select()
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
  const windows = await windowClocks(db, applicationId)
  const pending = nodes.filter(
    (n) => !DECISION_KINDS.includes(n.kind) && (n.status === 'open' || n.status === 'stayed'),
  )
  const running = windows.filter(
    (c) =>
      (c.status === 'running' || c.status === 'overdue') &&
      compareCivil(c.currentDue as CivilDate, today) >= 0,
  )
  const ends = windows
    .map((c) => c.currentDue as CivilDate)
    .sort((a, b) => compareCivil(a, b))
    .at(-1)
  const final = pending.length === 0 && running.length === 0
  const latest = nodes
    .filter((n) => FINAL_DECISION_KINDS.includes(n.kind))
    .sort((a, b) => compareCivil(a.occurredOn as CivilDate, b.occurredOn as CivilDate))
    .at(-1)
  const approving =
    latest !== undefined && APPROVING.includes(latest.outcome ?? '') ? latest : undefined
  return {
    final,
    finalOn: final && approving !== undefined ? (approving.occurredOn as CivilDate) : null,
    appealPeriodEndsOn: ends ?? null,
    open: pending.map((n) => ({ nodeId: n.id, kind: n.kind, due: null })),
  }
}
