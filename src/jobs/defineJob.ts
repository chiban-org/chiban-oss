import { and, eq, sql } from 'drizzle-orm'
import type { JobName } from '@/constants/jobNames'
import type { Db, Tx } from '@/db/client'
import { jobEffects, jobRuns } from '@/db/schema'
import { err, ok, type Result } from '@/types/result'
import { requireBoss } from './requireBoss'

export interface JobContext {
  db: Tx
  root: Db
  signal: AbortSignal
}

export interface CommittedFailure {
  ok: false
  error: string
  commitWrites: true
}

export type JobOutcome = Result<void, string> | CommittedFailure

export function failKeepingWrites(error: string): CommittedFailure {
  return { ok: false, error, commitWrites: true }
}

function isCommittedFailure(outcome: JobOutcome): outcome is CommittedFailure {
  return !outcome.ok && 'commitWrites' in outcome
}

export interface JobDefinition<P> {
  name: JobName
  intervalSeconds?: number
  timeoutSeconds?: number
  retryLimit?: number
  heartbeatSeconds?: number
  staleAfterSeconds?: number
  dedupKey(payload: P): string
  handler(payload: P, ctx: JobContext): Promise<JobOutcome>
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

async function execute<P>(job: JobDefinition<P>, payload: P, ctx: JobContext): Promise<JobOutcome> {
  try {
    return await job.handler(payload, ctx)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err(e instanceof Error ? e.message : String(e))
  }
}

class ClaimRolledBack extends Error {
  readonly outcome: Result<void, string>

  constructor(outcome: Result<void, string>) {
    super('job claim rolled back')
    this.outcome = outcome
  }
}

async function runClaimed<P>(
  db: Db,
  job: JobDefinition<P>,
  payload: P,
  signal: AbortSignal,
): Promise<Result<void, string>> {
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(jobEffects)
        .values({ jobName: job.name, dedupKey: job.dedupKey(payload) })
        .onConflictDoNothing()
        .returning({ key: jobEffects.dedupKey })
      if (claimed.length === 0) return ok(undefined)
      const outcome = await execute(job, payload, { db: tx, root: db, signal })
      if (isCommittedFailure(outcome)) {
        await tx
          .delete(jobEffects)
          .where(
            and(eq(jobEffects.jobName, job.name), eq(jobEffects.dedupKey, job.dedupKey(payload))),
          )
        return err(outcome.error)
      }
      if (!outcome.ok) throw new ClaimRolledBack(outcome)
      return outcome
    })
  } catch (e) {
    if (e instanceof ClaimRolledBack) return e.outcome
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
  const outcome = await runClaimed(db, job, payload, signal)
  await recordRun(db, job.name, outcome)
  return outcome.ok ? ok(undefined) : outcome
}
