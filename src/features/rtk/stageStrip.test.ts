import { describe, expect, it } from 'vitest'
import { type RequestStageInput, requestStages } from '@/features/rtk/stageStrip'
import type { CivilDate } from '@/types/civilDate'

const ON = '2026-11-03' as CivilDate
const STATED = { due: '2026-11-30' } as unknown as RequestStageInput['statedDue']

function input(patch: Partial<RequestStageInput>): RequestStageInput {
  return { status: 'open', statedDue: null, firstResponseOn: null, current: null, ...patch }
}

function summary(patch: Partial<RequestStageInput>): string[] {
  return requestStages(input(patch)).map(
    (s) => `${s.label}:${s.status}${s.overdue ? ':overdue' : ''}`,
  )
}

describe('request stage strip', () => {
  it('an open request is at Received with no time stated stage', () => {
    expect(summary({})).toEqual(['Received:current', 'Responded:upcoming', 'Closed:upcoming'])
  })

  it('an open request past its first response deadline is overdue at Received', () => {
    const current = { kind: 'overdue', dueOn: '2026-10-30', daysOverdue: 9 } as const
    expect(summary({ current: current as RequestStageInput['current'] })).toEqual([
      'Received:current:overdue',
      'Responded:upcoming',
      'Closed:upcoming',
    ])
  })

  it('a request due today is not overdue', () => {
    const current = { kind: 'due_today', dueOn: '2026-11-08' } as const
    expect(summary({ current: current as RequestStageInput['current'] })[0]).toBe(
      'Received:current',
    )
  })

  it('a time statement inserts Time stated as the current stage', () => {
    expect(
      summary({ status: 'awaiting_decision', statedDue: STATED, firstResponseOn: ON }),
    ).toEqual(['Received:done', 'Time stated:current', 'Responded:upcoming', 'Closed:upcoming'])
  })

  it('a responded request after a time statement keeps Time stated as done', () => {
    expect(summary({ status: 'responded', statedDue: STATED, firstResponseOn: ON })).toEqual([
      'Received:done',
      'Time stated:done',
      'Responded:current',
      'Closed:upcoming',
    ])
  })

  it('a closed request is done throughout', () => {
    expect(summary({ status: 'closed', firstResponseOn: ON })).toEqual([
      'Received:done',
      'Responded:done',
      'Closed:done',
    ])
  })

  it('a request closed without a response drops Responded', () => {
    expect(summary({ status: 'closed' })).toEqual(['Received:done', 'Closed:done'])
  })

  it('withdrawn replaces the stages not reached', () => {
    expect(summary({ status: 'withdrawn' })).toEqual(['Received:done', 'Withdrawn:current'])
    expect(summary({ status: 'withdrawn', statedDue: STATED, firstResponseOn: ON })).toEqual([
      'Received:done',
      'Time stated:done',
      'Responded:done',
      'Withdrawn:current',
    ])
  })

  it('a request answered and then withdrawn keeps Responded before Withdrawn', () => {
    expect(summary({ status: 'withdrawn', firstResponseOn: ON })).toEqual([
      'Received:done',
      'Responded:done',
      'Withdrawn:current',
    ])
  })
})
