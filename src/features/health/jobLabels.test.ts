import { describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { jobLabel } from '@/features/health/jobLabels'

describe('jobLabel', () => {
  it('has a human name for every job and none contains a dot key', () => {
    for (const name of Object.values(JOB_NAMES)) {
      const label = jobLabel(name)
      expect(label).not.toBe(name)
      expect(label).not.toContain('.')
    }
  })

  it('names the heartbeat and export pickup jobs', () => {
    expect(jobLabel('system.heartbeat')).toBe('System heartbeat')
    expect(jobLabel('exports.pickup')).toBe('Export pickup')
  })

  it('falls back to words for an unknown job', () => {
    expect(jobLabel('foo.barBaz')).toBe('Foo bar baz')
  })
})
