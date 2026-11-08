import { describe, expect, it } from 'vitest'
import type { CivilDate } from '@/types/civilDate'
import { type InspectionPlanInput, planInspection } from './inspectionPlan'

const IRA = 'user-ira'
const SAM = 'user-sam'
const TODAY = '2026-11-07' as CivilDate

type Over = Omit<Partial<InspectionPlanInput>, 'row'> & {
  row?: Partial<InspectionPlanInput['row']>
}

function input(over: Over = {}): InspectionPlanInput {
  const { row, ...rest } = over
  return {
    row: {
      id: 'i1',
      status: 'scheduled',
      inspectionType: 'final',
      reinspectionOf: null,
      inspectorUserId: IRA,
      scheduledDate: TODAY,
      startMinute: 540,
      resultRecordedAt: null,
      ...row,
    },
    viewerId: IRA,
    today: TODAY,
    inspectorName: 'Ira Inspector',
    recordedByName: null,
    resultDate: null,
    preferredDate: null,
    permitClosed: false,
    mayRecord: true,
    maySchedule: false,
    suspended: false,
    cancel: null,
    followUp: null,
    mayRequestReinspection: false,
    ...rest,
  }
}

function labels(plan: ReturnType<typeof planInspection>) {
  return plan.stages.map((s) => `${s.label}:${s.status}${s.overdue ? ':overdue' : ''}`)
}

describe('a requested inspection', () => {
  const requested = {
    row: {
      id: 'i1',
      status: 'requested' as const,
      inspectionType: 'insulation',
      reinspectionOf: null,
      inspectorUserId: null,
      scheduledDate: null,
      startMinute: null,
      resultRecordedAt: null,
    },
  }

  it('waits on the town and offers Schedule it to those who schedule', () => {
    const plan = planInspection(
      input({ ...requested, maySchedule: true, preferredDate: '2026-11-10' as CivilDate }),
    )
    expect(plan.sentence).toBe('Waiting on: Town. Schedule the Insulation inspection.')
    expect(plan.now).toEqual({
      kind: 'schedule',
      task: 'Schedule the Insulation inspection',
      note: 'The requester prefers November 10, 2026.',
    })
    expect(plan.owed).toBeNull()
    expect(labels(plan)).toEqual(['Requested:current', 'Scheduled:upcoming', 'Result:upcoming'])
  })

  it('tells someone who cannot schedule that the town schedules it', () => {
    const plan = planInspection(input({ ...requested, viewerId: SAM }))
    expect(plan.now).toEqual({
      kind: 'wait_schedule',
      task: 'Waiting on the town to schedule it',
      note: 'The requester has no preferred day.',
    })
  })

  it('notes a reinspection in its first stage', () => {
    const plan = planInspection(
      input({ ...requested, row: { ...requested.row, reinspectionOf: 'i0' } }),
    )
    expect(plan.sentence).toBe('Waiting on: Town. Schedule the Insulation reinspection.')
    expect(plan.stages[0]?.label).toBe('Reinspection requested')
  })
})

describe('a scheduled inspection', () => {
  it('asks the assigned inspector to record the result on the day', () => {
    const plan = planInspection(input())
    expect(plan.sentence).toBe('Waiting on: Inspector (you). Final inspection today at 9:00 AM.')
    expect(plan.now).toEqual({
      kind: 'record',
      task: 'Record the result',
      note: 'Today at 9:00 AM',
    })
    expect(labels(plan)).toEqual(['Requested:done', 'Scheduled:done', 'Result:current'])
  })

  it('shows a clerk who is waiting on whom', () => {
    const plan = planInspection(input({ viewerId: SAM, mayRecord: false }))
    expect(plan.sentence).toBe(
      'Waiting on: Inspector (Ira Inspector). Final inspection today at 9:00 AM.',
    )
    expect(plan.now).toEqual({
      kind: 'waiting',
      task: 'Waiting on Ira Inspector',
      note: 'Today at 9:00 AM',
    })
  })

  it('before its day, says the result is recorded on the day', () => {
    const plan = planInspection(input({ row: { scheduledDate: '2026-11-12' } }))
    expect(plan.now).toEqual({
      kind: 'record_later',
      task: 'Record the result on the day',
      note: 'This inspection can be recorded on or after its scheduled date.',
    })
    expect(labels(plan)).toEqual(['Requested:done', 'Scheduled:current', 'Result:upcoming'])
  })

  it('past its day, says since when the result is owed and how late', () => {
    const plan = planInspection(input({ row: { scheduledDate: '2026-11-03' } }))
    expect(plan.owed).toBe('Result owed since November 3, 2026 (4 days late)')
    expect(plan.sentence).toBe(
      'Waiting on: Inspector (you). Final inspection from November 3, 2026 needs its result.',
    )
    expect(labels(plan)).toEqual(['Requested:done', 'Scheduled:done', 'Result:current:overdue'])
  })

  it('counts one day late in the singular', () => {
    const plan = planInspection(input({ row: { scheduledDate: '2026-11-06' } }))
    expect(plan.owed).toBe('Result owed since November 6, 2026 (1 day late)')
  })

  it('pauses the checklist while the permit is under appeal', () => {
    const plan = planInspection(input({ suspended: true }))
    expect(plan.sentence).toBe('Inspections are paused while this permit is under appeal.')
    expect(plan.now).toEqual({
      kind: 'paused',
      task: 'Wait for the appeal to be decided',
      note: 'The checklist opens again once the permit is no longer under appeal.',
    })
  })
})

describe('a recorded inspection', () => {
  const recorded = {
    recordedByName: 'Ira Inspector',
    resultDate: '2026-11-05' as CivilDate,
  }

  it('reads only its outcome once passed', () => {
    const plan = planInspection(
      input({ ...recorded, row: { status: 'passed', inspectionType: 'rough' } }),
    )
    expect(plan.sentence).toBe('Passed on November 7, 2026.')
    expect(plan.now).toEqual({
      kind: 'outcome',
      task: 'Passed',
      note: 'Recorded by Ira Inspector on November 5, 2026.',
    })
    expect(labels(plan)).toEqual(['Requested:done', 'Scheduled:done', 'Passed:done'])
  })

  it('says the permit is closed after a passed final closed it', () => {
    const plan = planInspection(
      input({ ...recorded, permitClosed: true, row: { status: 'passed' } }),
    )
    expect(plan.sentence).toBe('Passed on November 7, 2026. The permit is closed.')
    expect(plan.now).toEqual({
      kind: 'outcome',
      task: 'The permit is closed.',
      note: 'Passed. Recorded by Ira Inspector on November 5, 2026.',
    })
  })

  it('offers the reinspection on a failure the town can still reinspect', () => {
    const plan = planInspection(
      input({
        ...recorded,
        maySchedule: true,
        mayRequestReinspection: true,
        row: { status: 'failed', inspectionType: 'framing' },
      }),
    )
    expect(plan.sentence).toBe('Failed on November 7, 2026. No reinspection is requested yet.')
    expect(plan.now).toEqual({
      kind: 'request_reinspection',
      task: 'Request the reinspection',
      note: 'Recorded by Ira Inspector on November 5, 2026.',
    })
    expect(labels(plan)).toEqual(['Requested:done', 'Scheduled:done', 'Failed:done'])
  })

  it('points to the reinspection already on file', () => {
    const plan = planInspection(
      input({
        ...recorded,
        maySchedule: true,
        followUp: { id: 'i2', status: 'scheduled' },
        row: { status: 'failed', inspectionType: 'framing' },
      }),
    )
    expect(plan.sentence).toBe('Failed on November 7, 2026. The reinspection is scheduled.')
    expect(plan.now).toEqual({
      kind: 'reinspection_on_file',
      task: 'Reinspection scheduled',
      note: 'Recorded by Ira Inspector on November 5, 2026.',
    })
  })

  it('dates the outcome by the inspection visit, not by when it was recorded', () => {
    const plan = planInspection(
      input({
        ...recorded,
        row: { status: 'failed', scheduledDate: '2026-11-04' as CivilDate },
      }),
    )
    expect(plan.sentence).toBe('Failed on November 4, 2026.')
    expect(plan.now.note).toBe('Recorded by Ira Inspector on November 5, 2026.')
  })

  it('reads only the failure to someone who cannot request the reinspection', () => {
    const plan = planInspection(
      input({ ...recorded, mayRequestReinspection: true, row: { status: 'failed' } }),
    )
    expect(plan.now.kind).toBe('outcome')
    expect(plan.now.task).toBe('Failed')
  })
})

describe('a cancelled inspection', () => {
  it('ends the strip with Cancelled and says when', () => {
    const plan = planInspection(
      input({
        row: { status: 'cancelled', inspectionType: 'footing' },
        cancel: { reason: 'permit_suspended', byName: null, on: '2026-11-01' as CivilDate },
      }),
    )
    expect(plan.sentence).toBe('Cancelled on November 1, 2026.')
    expect(plan.now).toEqual({ kind: 'cancelled', task: 'Cancelled', note: null })
    expect(labels(plan)).toEqual(['Requested:done', 'Scheduled:done', 'Cancelled:current'])
  })

  it('leaves out Scheduled when it was never booked', () => {
    const plan = planInspection(
      input({
        row: { status: 'cancelled', scheduledDate: null, startMinute: null },
        cancel: { reason: 'requester', byName: 'Pat Owner', on: null },
      }),
    )
    expect(plan.sentence).toBe('Cancelled.')
    expect(labels(plan)).toEqual(['Requested:done', 'Cancelled:current'])
  })
})
