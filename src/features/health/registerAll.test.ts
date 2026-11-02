import { describe, expect, it, vi } from 'vitest'
import { ALL_JOBS } from '@/jobs/allJobs'
import { registerAllJobs } from '@/jobs/registerJobs'

describe('registerAllJobs', () => {
  it('registers every entry of ALL_JOBS', async () => {
    const boss = {
      getQueue: vi.fn(() => Promise.resolve(null)),
      createQueue: vi.fn(() => Promise.resolve()),
      work: vi.fn(() => Promise.resolve('w')),
      schedule: vi.fn(() => Promise.resolve()),
    }
    await registerAllJobs(boss as never, {} as never)
    const worked = boss.work.mock.calls.map((c) => (c as unknown as [string])[0]).sort()
    expect(worked).toEqual(ALL_JOBS.map((j) => j.name).sort())
    const scheduled = boss.schedule.mock.calls.map((c) => (c as unknown as [string])[0]).sort()
    expect(scheduled).toEqual(
      ALL_JOBS.filter((j) => j.intervalSeconds !== undefined)
        .map((j) => j.name)
        .sort(),
    )
  })

  it('lists each job name once', () => {
    const names = ALL_JOBS.map((j) => j.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
