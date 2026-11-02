import { and, eq, isNotNull } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import { exportTargets } from '@/db/schema'
import { dueTargets } from '@/features/export/dueTargets'
import { runIncremental } from '@/features/export/incremental'
import { buildTarget } from '@/features/export/targets/manageTargets'
import { getObjectStore } from '@/features/storage/objectStore'
import { ok } from '@/types/result'
import { defineJob, failKeepingWrites } from './defineJob'

const DAY_SECONDS = 24 * 60 * 60
const DAY_CHARS = 10
const MINUTE_CHARS = 16

export const exportsIncrementalJob = defineJob<{ at?: string; manual?: boolean }>({
  name: JOB_NAMES.EXPORTS_INCREMENTAL,
  intervalSeconds: DAY_SECONDS,
  dedupKey: (p) => {
    const at = p.at ?? new Date().toISOString()
    return p.manual === true
      ? `${JOB_NAMES.EXPORTS_INCREMENTAL}:manual:${at.slice(0, MINUTE_CHARS)}`
      : `${JOB_NAMES.EXPORTS_INCREMENTAL}:${at.slice(0, DAY_CHARS)}`
  },
  handler: async (payload, ctx) => {
    const now = payload.at === undefined ? new Date() : new Date(payload.at)
    const store = getObjectStore()
    const failures: string[] = []
    for (const row of await dueTargets(ctx.root, now, ctx.signal)) {
      await ctx.root
        .update(exportTargets)
        .set({ runRequestedAt: null })
        .where(and(eq(exportTargets.id, row.id), isNotNull(exportTargets.runRequestedAt)))
      const built = buildTarget(row, { fetch, now: () => new Date() })
      if (!built.ok) {
        const detail = `the target ${built.error === 'bad_settings' ? 'settings' : 'credentials'} are not usable`
        await ctx.root
          .update(exportTargets)
          .set({ lastFailureAt: new Date(), lastError: detail })
          .where(eq(exportTargets.id, row.id))
        failures.push(`${row.name}: ${detail}`)
        continue
      }
      const ran = await runIncremental(ctx.root, store, built.value, row.id, now, ctx.signal)
      if (!ran.ok) failures.push(`${row.name}: ${ran.error.detail}`)
    }
    return failures.length === 0 ? ok(undefined) : failKeepingWrites(failures.join('; '))
  },
})
