import { describe, expect, it, vi } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { heartbeatJob } from '@/jobs/heartbeat'
import { registerAllJobs } from '@/jobs/registerJobs'

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
})
