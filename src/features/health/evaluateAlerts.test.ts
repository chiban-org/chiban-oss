import { describe, expect, it } from 'vitest'
import { evaluateAlerts } from '@/features/health/evaluateAlerts'

const none = { jobs: [], schedules: [], scheduledJobNames: [] }

describe('evaluateAlerts', () => {
  it('0.81 is a disk warning and 0.91 a critical without a warning', () => {
    const warning = evaluateAlerts({ ...none, disks: [{ path: '/data', usedRatio: 0.81 }] })
    expect(warning.map((a) => [a.kind, a.severity])).toEqual([['disk_warning', 'warning']])
    const critical = evaluateAlerts({ ...none, disks: [{ path: '/data', usedRatio: 0.91 }] })
    expect(critical.map((a) => [a.kind, a.severity])).toEqual([['disk_critical', 'critical']])
    expect(critical).toHaveLength(1)
    expect(evaluateAlerts({ ...none, disks: [{ path: '/data', usedRatio: 0.8 }] })).toEqual([])
  })

  it('an interval job missing from schedules is schedule_missing', () => {
    const alerts = evaluateAlerts({
      disks: [],
      jobs: [],
      schedules: ['system.heartbeat'],
      scheduledJobNames: ['system.heartbeat', 'clocks.daily'],
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      key: 'schedule_missing:clocks.daily',
      kind: 'schedule_missing',
      severity: 'critical',
    })
  })

  it('a stale job is a job_stale alert and a fresh one is not', () => {
    const jobs = [
      {
        name: 'system.heartbeat',
        intervalSeconds: 300,
        lastSuccessAt: null,
        lastFailureAt: null,
        stale: true,
      },
      {
        name: 'clocks.daily',
        intervalSeconds: 86400,
        lastSuccessAt: null,
        lastFailureAt: null,
        stale: false,
      },
    ] as const
    const alerts = evaluateAlerts({ ...none, disks: [], jobs: [...jobs] })
    expect(alerts.map((a) => a.key)).toEqual(['job_stale:system.heartbeat'])
  })
})
