import { JOB_NAMES } from '@/constants/jobNames'
import type { Db } from '@/db/client'
import { err, ok } from '@/types/result'
import { defineJob, enqueue } from './defineJob'
import { SWEEP_TARGETS, type SweepTarget } from './sweepTargets'

const INTERVAL_SECONDS = 300
const MINUTE_CHARS = 16

export interface SweepResult {
  counts: Record<string, number>
  failures: string[]
}

export async function runSweep(
  db: Db,
  now: Date,
  signal: AbortSignal,
  targets: readonly SweepTarget[] = SWEEP_TARGETS,
): Promise<SweepResult> {
  const counts: Record<string, number> = {}
  const failures: string[] = []
  for (const target of targets) {
    try {
      const items = await target.findOverdue(db, now, signal)
      for (const item of items) await enqueue(item.job, item.payload, signal)
      counts[target.name] = items.length
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      counts[target.name] = 0
      failures.push(`${target.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { counts, failures }
}

interface SweepPayload {
  at?: string
}

export const jobsSweepJob = defineJob<SweepPayload>({
  name: JOB_NAMES.JOBS_SWEEP,
  intervalSeconds: INTERVAL_SECONDS,
  dedupKey: (p) =>
    `${JOB_NAMES.JOBS_SWEEP}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
  handler: async (_payload, ctx) => {
    const result = await runSweep(ctx.root, new Date(), ctx.signal)
    if (Object.values(result.counts).some((n) => n > 0)) {
      console.warn(`[sweep] re-enqueued ${JSON.stringify(result.counts)}`)
    }
    return result.failures.length > 0 ? err(result.failures.join('; ')) : ok(undefined)
  },
})
