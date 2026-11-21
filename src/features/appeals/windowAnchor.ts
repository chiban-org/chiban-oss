import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appealNodes } from '@/db/schema'
import { loadPack } from '@/features/packs/loadPack'
import type { AppealNodeKind } from '@/features/packs/schema'

type NodeRow = typeof appealNodes.$inferSelect

const RECONSIDERATION_STEPS: readonly AppealNodeKind[] = ['rehearing_outcome', 'rehearing_motion']

function startsAtTheVote(ruleKey: string): boolean {
  return loadPack().rules.some(
    (r) => r.kind === 'clock' && r.key === ruleKey && r.startEvent === 'board_vote',
  )
}

export async function windowAnchor(db: DbOrTx, parent: NodeRow, ruleKey: string): Promise<NodeRow> {
  if (!RECONSIDERATION_STEPS.includes(parent.kind) || !startsAtTheVote(ruleKey)) return parent
  let node = parent
  for (let hops = 0; hops < RECONSIDERATION_STEPS.length; hops++) {
    if (!RECONSIDERATION_STEPS.includes(node.kind) || node.parentId === null) break
    const [up] = await db.select().from(appealNodes).where(eq(appealNodes.id, node.parentId))
    if (up === undefined) break
    node = up
  }
  return node
}
