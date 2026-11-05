import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import { TownRuleSettingBodySchema } from '@/features/config/kinds'

export async function publishedTownRuleValues(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<ReadonlyMap<string, number>> {
  signal.throwIfAborted()
  const rows = await db
    .select({ key: configVersions.key, body: configVersions.body })
    .from(configVersions)
    .where(
      and(eq(configVersions.kind, 'town_rule_setting'), eq(configVersions.status, 'published')),
    )
  const values = new Map<string, number>()
  for (const row of rows) {
    const parsed = TownRuleSettingBodySchema.safeParse(row.body)
    if (parsed.success) values.set(row.key, parsed.data.value)
  }
  return values
}
