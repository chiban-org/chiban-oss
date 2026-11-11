import { describe, expect, it, vi } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { defineJob } from '@/jobs/defineJob'
import { heartbeatJob } from '@/jobs/heartbeat'
import { registerAllJobs, registerJob } from '@/jobs/registerJobs'

describe('registerAllJobs', () => {
  it('creates the queue, starts a worker, and schedules interval jobs', async () => {
    const boss = {
      getQueue: vi.fn(() => Promise.resolve(null)),
      createQueue: vi.fn(() => Promise.resolve()),
      work: vi.fn(() => Promise.resolve('w')),
      schedule: vi.fn(() => Promise.resolve()),
    }
    await registerAllJobs(boss as never, {} as never)
    expect(boss.createQueue).toHaveBeenCalledWith(JOB_NAMES.HEARTBEAT, { policy: 'exclusive' })
    expect(boss.work).toHaveBeenCalledWith(JOB_NAMES.HEARTBEAT, expect.any(Function))
    expect(heartbeatJob.intervalSeconds).toBeDefined()
    expect(boss.schedule).toHaveBeenCalledWith(JOB_NAMES.HEARTBEAT, '*/5 * * * *')
  })

  it('gives a long job its own expiry and retry limit when it sets them', async () => {
    const boss = {
      getQueue: vi.fn(() => Promise.resolve(null)),
      createQueue: vi.fn(() => Promise.resolve()),
      work: vi.fn(() => Promise.resolve('w')),
      schedule: vi.fn(() => Promise.resolve()),
    }
    const job = defineJob<object>({
      name: JOB_NAMES.BACKUPS_SCHEDULED,
      timeoutSeconds: 6 * 60 * 60,
      retryLimit: 0,
      dedupKey: () => 'k',
      handler: () => Promise.resolve({ ok: true, value: undefined }),
    })
    await registerJob(boss as never, {} as never, job)
    expect(boss.createQueue).toHaveBeenCalledWith(JOB_NAMES.BACKUPS_SCHEDULED, {
      policy: 'exclusive',
      expireInSeconds: 6 * 60 * 60,
      retryLimit: 0,
    })
  })

  it('runs a scheduled job whose payload arrives as null', async () => {
    const handlers: ((batch: { data: unknown }[]) => Promise<void>)[] = []
    const boss = {
      getQueue: vi.fn(() => Promise.resolve({})),
      createQueue: vi.fn(() => Promise.resolve()),
      work: vi.fn((_name: string, handler: (batch: { data: unknown }[]) => Promise<void>) => {
        handlers.push(handler)
        return Promise.resolve('w')
      }),
      schedule: vi.fn(() => Promise.resolve()),
    }
    const seen: unknown[] = []
    const db: Record<string, unknown> = {
      transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      }),
    }
    const job = defineJob<{ at?: string }>({
      name: JOB_NAMES.HEARTBEAT,
      dedupKey: (payload) => {
        seen.push(payload)
        return `k:${payload.at ?? 'none'}`
      },
      handler: () => Promise.resolve({ ok: true, value: undefined }),
    })
    await registerJob(boss as never, db as never, job)
    await handlers[0]?.([{ data: null }])
    expect(seen[0]).toEqual({})
  })
})
