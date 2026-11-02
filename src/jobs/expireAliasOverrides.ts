import { JOB_NAMES } from '@/constants/jobNames'
import { expireAliasOverrides } from '@/features/parcels/aliasOverrides'
import { todayInTimeZone } from '@/types/civilDate'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const SECONDS_PER_DAY = 86_400
const FALLBACK_TIME_ZONE = 'UTC'

export const expireAliasOverridesJob = defineJob<Record<string, never>>({
  name: JOB_NAMES.EXPIRE_ALIAS_OVERRIDES,
  intervalSeconds: SECONDS_PER_DAY,
  dedupKey: () => `expire:${todayInTimeZone(FALLBACK_TIME_ZONE, new Date())}`,
  handler: async (_payload, ctx) => {
    await expireAliasOverrides(ctx.db, new Date(), ctx.signal)
    return ok(undefined)
  },
})
