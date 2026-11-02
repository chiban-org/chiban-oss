import { sql } from 'drizzle-orm'
import type { JobName } from '@/constants/jobNames'
import type { Db } from '@/db/client'
import { jobRuns } from '@/db/schema'
import { err, ok, type Result } from '@/types/result'
import { requireBoss } from './requireBoss'

export interface JobContext {
  db: Db
  signal: AbortSignal
}

export interface JobDefinition<P> {
  name: JobName
  intervalSeconds?: number
  dedupKey(payload: P): string
  handler(payload: P, ctx: JobContext): Promise<Result<void, string>>
}

export function defineJob<P>(definition: JobDefinition<P>): JobDefinition<P> {
  return definition
}

export async function enqueue<P extends object>(
  job: JobDefinition<P>,
  payload: P,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted()
  return await requireBoss().send(job.name, payload, { singletonKey: job.dedupKey(payload) })
}

async function recordRun(db: Db, name: JobName, outcome: Result<void, string>): Promise<void> {
  const now = new Date()
  if (outcome.ok) {
    await db
      .insert(jobRuns)
      .values({ jobName: name, lastSuccessAt: now })
      .onConflictDoUpdate({ target: jobRuns.jobName, set: { lastSuccessAt: now } })
    return
  }
  await db
    .insert(jobRuns)
    .values({ jobName: name, lastFailureAt: now, lastError: outcome.error })
    .onConflictDoUpdate({
      target: jobRuns.jobName,
      set: { lastFailureAt: now, lastError: sql`excluded.last_error` },
    })
}

async function execute<P>(
  job: JobDefinition<P>,
  payload: P,
  ctx: JobContext,
): Promise<Result<void, string>> {
  try {
    return await job.handler(payload, ctx)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err(e instanceof Error ? e.message : String(e))
  }
}

export async function runJob<P>(
  db: Db,
  job: JobDefinition<P>,
  payload: P,
  signal: AbortSignal,
): Promise<Result<void, string>> {
  signal.throwIfAborted()
  const outcome = await execute(job, payload, { db, signal })
  await recordRun(db, job.name, outcome)
  return outcome.ok ? ok(undefined) : outcome
}
