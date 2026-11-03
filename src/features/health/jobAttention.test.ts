import { describe, expect, it } from 'vitest'
import { jobNeedsAttention, splitJobs } from '@/features/health/jobAttention'
import type { JobHealthRow } from '@/features/health/jobHealth'

const at = (iso: string) => new Date(iso)

function job(over: Partial<JobHealthRow>): JobHealthRow {
  return {
    name: 'system.heartbeat',
    intervalSeconds: 60,
    lastSuccessAt: null,
    lastFailureAt: null,
    stale: false,
    ...over,
  }
}

describe('jobs that need attention', () => {
  it('flags an overdue job and one whose last run failed', () => {
    expect(jobNeedsAttention(job({ stale: true }))).toBe(true)
    expect(jobNeedsAttention(job({ lastFailureAt: at('2026-11-02T10:00:00Z') }))).toBe(true)
    expect(
      jobNeedsAttention(
        job({
          lastSuccessAt: at('2026-11-02T09:00:00Z'),
          lastFailureAt: at('2026-11-02T10:00:00Z'),
        }),
      ),
    ).toBe(true)
  })

  it('leaves healthy, recovered and never-run jobs alone', () => {
    expect(jobNeedsAttention(job({ lastSuccessAt: at('2026-11-02T10:00:00Z') }))).toBe(false)
    expect(
      jobNeedsAttention(
        job({
          lastSuccessAt: at('2026-11-02T11:00:00Z'),
          lastFailureAt: at('2026-11-02T10:00:00Z'),
        }),
      ),
    ).toBe(false)
    expect(jobNeedsAttention(job({}))).toBe(false)
  })

  it('splits jobs keeping their order', () => {
    const a = job({ name: 'system.heartbeat', stale: true })
    const b = job({ name: 'clocks.daily' })
    expect(splitJobs([b, a])).toEqual({ attention: [a], rest: [b] })
  })
})
