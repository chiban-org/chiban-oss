import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardDecisions } from '@/db/schema'
import { onlyWhenConditions } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import type { Pack } from '@/features/packs/loadPack'

function packStartsOnSignificance(pack: Pack): boolean {
  return pack.rules.some(
    (r) =>
      r.kind === 'clock' &&
      onlyWhenConditions(r.onlyWhen).some((c) => c.fact === 'significantDecision'),
  )
}

export async function significanceFact(
  db: DbOrTx,
  applicationId: string,
  pack: Pack,
): Promise<Pick<ProjectFacts, 'significantDecision'>> {
  if (!packStartsOnSignificance(pack)) return {}
  const [row] = await db
    .select({ significant: boardDecisions.significant })
    .from(boardDecisions)
    .where(
      and(eq(boardDecisions.applicationId, applicationId), isNotNull(boardDecisions.significant)),
    )
    .orderBy(desc(boardDecisions.recordedAt), desc(boardDecisions.votedOn))
    .limit(1)
  return { significantDecision: row?.significant === true }
}
