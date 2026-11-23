import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { clocks } from '@/db/schema'
import { offersCertification } from '@/features/boards/certificationClock'
import { clockRuleIs } from '@/features/clocks/ruleKeyIs'
import { packRoles } from '@/features/packs/roles'

export interface BoardPanelClocks {
  decisionOpen: boolean
  exerciseDue: string | null
}

export async function boardPanelClocks(db: Db, applicationId: string): Promise<BoardPanelClocks> {
  const { rules } = packRoles()
  const [decision] = await db
    .select({ ruleKey: clocks.ruleKey, ruleVersion: clocks.ruleVersion })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        clockRuleIs(rules.planningBoardDecision),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
  const [exercise] = await db
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        clockRuleIs(rules.zbaExercise),
        eq(clocks.status, 'running'),
      ),
    )
  return {
    decisionOpen: decision !== undefined && offersCertification(decision),
    exerciseDue: exercise?.currentDue ?? null,
  }
}

export function boundByClassification(
  mandatoryRuleKeys: readonly string[] | undefined,
  ruleKey: string | null,
): boolean {
  return ruleKey !== null && mandatoryRuleKeys?.includes(ruleKey) === true
}
