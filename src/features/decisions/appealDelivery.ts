import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { appealNodes } from '@/db/schema'
import { deliveryRuleFor, planDeliveries } from '@/features/decisions/delivery'
import { startDeliveryClock } from '@/features/decisions/deliveryClocks'
import { loadPack } from '@/features/packs/loadPack'
import type { DecisionOutcome } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export async function planAppealDecisionDelivery(
  tx: Tx,
  nodeId: string,
  linked: boolean,
  input: { occurredOn: CivilDate; outcome?: string },
  signal: AbortSignal,
): Promise<void> {
  await planDeliveries(tx, { appealNodeId: nodeId }, signal)
  if (!linked || input.outcome === undefined) return
  const rule = deliveryRuleFor(loadPack(), 'zba')
  if (rule === null) return
  const [node] = await tx.select().from(appealNodes).where(eq(appealNodes.id, nodeId))
  if (node?.applicationId == null) return
  await startDeliveryClock(
    tx,
    {
      applicationId: node.applicationId,
      dueRuleKey: rule.dueRuleKey,
      onDate: input.occurredOn,
      outcome: input.outcome as DecisionOutcome,
    },
    signal,
  )
}
