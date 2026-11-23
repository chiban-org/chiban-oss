import { eq, type SQL, sql } from 'drizzle-orm'
import { clocks } from '@/db/schema'

export function clockRuleIs(ruleKey: string | null): SQL {
  return ruleKey === null ? sql`false` : eq(clocks.ruleKey, ruleKey)
}
