import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appealNodes, boardDecisions } from '@/db/schema'
import type { AppealNodeKind, AppealRoute } from '@/features/packs/schema'

type NodeRow = typeof appealNodes.$inferSelect

const RECONSIDERATION_STEPS: readonly AppealNodeKind[] = ['rehearing_outcome', 'rehearing_motion']

export function usesSignificance(routes: readonly AppealRoute[]): boolean {
  return routes.some((r) => r.when?.significant !== undefined)
}

async function reconsideredFrom(
  db: DbOrTx,
  node: Pick<NodeRow, 'kind' | 'parentId'>,
): Promise<NodeRow | null> {
  if (!RECONSIDERATION_STEPS.includes(node.kind) || node.parentId === null) return null
  const [parent] = await db.select().from(appealNodes).where(eq(appealNodes.id, node.parentId))
  return parent ?? null
}

async function decisionSignificance(db: DbOrTx, decisionId: string): Promise<boolean | null> {
  const [row] = await db
    .select({ significant: boardDecisions.significant })
    .from(boardDecisions)
    .where(eq(boardDecisions.id, decisionId))
  return row?.significant ?? null
}

export async function significanceForRoutes(
  db: DbOrTx,
  parent: Pick<NodeRow, 'kind' | 'parentId' | 'decisionId'>,
  routes: readonly AppealRoute[],
  signal: AbortSignal,
): Promise<boolean | null> {
  if (!usesSignificance(routes)) return null
  signal.throwIfAborted()
  let node: Pick<NodeRow, 'kind' | 'parentId' | 'decisionId'> | null = parent
  for (let hops = 0; node !== null && hops <= RECONSIDERATION_STEPS.length; hops++) {
    if (node.decisionId !== null) return await decisionSignificance(db, node.decisionId)
    node = await reconsideredFrom(db, node)
  }
  return null
}
