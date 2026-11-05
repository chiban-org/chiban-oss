import { and, desc, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { clocks } from '@/db/schema'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

let lapseKeys: string[] | null = null

export function lapseRuleKeys(): string[] {
  lapseKeys ??= loadPack()
    .rules.filter((r) => r.kind === 'clock' && r.consequence.kind === 'lapse')
    .map((r) => r.key)
  return lapseKeys
}

export async function expiryDates(
  db: DbOrTx,
  applicationIds: string[],
): Promise<Map<string, CivilDate>> {
  const keys = lapseRuleKeys()
  if (applicationIds.length === 0 || keys.length === 0) return new Map()
  const rows = await db
    .select({ applicationId: clocks.applicationId, due: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        inArray(clocks.applicationId, applicationIds),
        inArray(clocks.ruleKey, keys),
        isNull(clocks.supersededBy),
      ),
    )
    .orderBy(desc(clocks.createdAt), desc(clocks.id))
  const out = new Map<string, CivilDate>()
  for (const row of rows) {
    if (!out.has(row.applicationId)) out.set(row.applicationId, row.due as CivilDate)
  }
  return out
}
