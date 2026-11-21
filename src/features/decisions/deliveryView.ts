import { and, asc, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { clocks, decisionDeliveries } from '@/db/schema'
import {
  DELIVERY_ROLE_LABELS,
  type DeliverySource,
  deliveryRuleFor,
  packDeliversDecisions,
  resolveSource,
} from '@/features/decisions/delivery'
import { loadPack } from '@/features/packs/loadPack'
import type { DeliveryMethod } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'

export interface DeliveryRowView {
  id: string
  roleLabel: string
  name: string
  delivered: string | null
}

export interface DeliveryGroupView {
  key: string
  source: 'decision' | 'appeal'
  title: string
  dueText: string | null
  methods: { value: DeliveryMethod; label: string }[]
  rows: DeliveryRowView[]
}

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  mail: 'Mailed',
  hand: 'Hand delivered',
}

async function dueTextFor(
  db: DbOrTx,
  applicationId: string,
  ruleKey: string,
  startDate: string,
): Promise<string | null> {
  const [clock] = await db
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, ruleKey),
        eq(clocks.startDate, startDate),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock === undefined ? null : formatCivilDate(clock.currentDue)
}

export async function loadDeliveryGroups(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<DeliveryGroupView[]> {
  signal.throwIfAborted()
  if (!packDeliversDecisions()) return []
  const rows = await db
    .select()
    .from(decisionDeliveries)
    .where(eq(decisionDeliveries.applicationId, applicationId))
    .orderBy(asc(decisionDeliveries.decisionId), asc(decisionDeliveries.appealNodeId))
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const key = r.decisionId ?? r.appealNodeId ?? ''
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const out: { happenedOn: string; group: DeliveryGroupView }[] = []
  for (const [key, members] of groups) {
    const first = members[0]
    if (first === undefined) continue
    const source: DeliverySource =
      first.decisionId === null ? { appealNodeId: key } : { decisionId: key }
    const resolved = await resolveSource(db, source, signal)
    if (resolved === null) continue
    const rule = deliveryRuleFor(loadPack(), resolved.boardKind)
    if (rule === null) continue
    const group: DeliveryGroupView = {
      key,
      source: first.decisionId === null ? 'appeal' : 'decision',
      title:
        first.decisionId === null
          ? `Decision after appeal, ${formatCivilDate(resolved.happenedOn)}`
          : `Board decision, voted ${formatCivilDate(resolved.happenedOn)}`,
      dueText: await dueTextFor(db, applicationId, rule.dueRuleKey, resolved.happenedOn),
      methods: rule.methods.map((value) => ({ value, label: METHOD_LABELS[value] })),
      rows: members.map((m) => ({
        id: m.id,
        roleLabel: DELIVERY_ROLE_LABELS[m.recipientRole],
        name: m.recipientName,
        delivered:
          m.deliveredOn === null || m.method === null
            ? null
            : `${METHOD_LABELS[m.method]} ${formatCivilDate(m.deliveredOn)}`,
      })),
    }
    out.push({ happenedOn: resolved.happenedOn, group })
  }
  return out
    .sort(
      (a, b) => a.happenedOn.localeCompare(b.happenedOn) || a.group.key.localeCompare(b.group.key),
    )
    .map((o) => o.group)
}
