import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appealNodes } from '@/db/schema'
import { loadPack } from '@/features/packs/loadPack'
import type { AppealNodeKind } from '@/features/packs/schema'

type NodeRow = typeof appealNodes.$inferSelect

const RECONSIDERATION_STEPS: readonly AppealNodeKind[] = ['rehearing_outcome', 'rehearing_motion']
const MAX_RECONSIDERATION_HOPS = RECONSIDERATION_STEPS.length

function startsAtTheVote(ruleKey: string): boolean {
  return loadPack().rules.some(
    (r) => r.kind === 'clock' && r.key === ruleKey && r.startEvent === 'board_vote',
  )
}

export async function originalDecision(db: DbOrTx, node: NodeRow): Promise<NodeRow | null> {
  if (!RECONSIDERATION_STEPS.includes(node.kind)) return null
  let at = node
  for (let hops = 0; hops < MAX_RECONSIDERATION_HOPS; hops++) {
    if (!RECONSIDERATION_STEPS.includes(at.kind) || at.parentId === null) break
    const [up] = await db.select().from(appealNodes).where(eq(appealNodes.id, at.parentId))
    if (up === undefined) break
    at = up
  }
  return RECONSIDERATION_STEPS.includes(at.kind) ? null : at
}

export async function windowAnchor(db: DbOrTx, parent: NodeRow, ruleKey: string): Promise<NodeRow> {
  if (!RECONSIDERATION_STEPS.includes(parent.kind) || !startsAtTheVote(ruleKey)) return parent
  return (await originalDecision(db, parent)) ?? parent
}
