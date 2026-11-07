import { describe, expect, it } from 'vitest'
import { meetingConflict, meetingDeadline, meetingHint, meetingOptionText } from './meetingDeadline'
import type { PlanBoard } from './workPlanTypes'

function clock(ruleKey: string, due: string, o: Record<string, unknown> = {}) {
  return {
    ruleKey,
    ruleLabel: ruleKey === 'nh.zba.hearing' ? 'ZBA hearing deadline' : 'Completeness',
    status: 'running' as const,
    daysRemaining: 6,
    currentDue: { value: due },
    ...o,
  } as never
}

const MEETINGS = [
  {
    id: 'm12',
    date: '2026-11-12',
    text: 'November 12, 2026, regular meeting',
    filedInTime: true,
    noticeable: true,
  },
  {
    id: 'm25',
    date: '2026-11-25',
    text: 'November 25, 2026, regular meeting',
    filedInTime: true,
    noticeable: true,
  },
  {
    id: 'd09',
    date: '2026-12-09',
    text: 'December 9, 2026, regular meeting',
    filedInTime: true,
    noticeable: true,
  },
]

const PLANNING: PlanBoard = {
  boardKind: 'planning_board',
  boardName: 'Planning Board',
  missingBoard: null,
  acceptanceMeetingId: 'm25',
  acceptanceDate: '2026-11-25',
  acceptanceText: 'November 25, 2026',
  meetings: MEETINGS,
  today: '2026-11-06',
}

describe('the deadline a board meeting must meet', () => {
  it('reads the clock the acceptance vote meets, not another clock due sooner', () => {
    const clocks = [
      clock('nh.pb.filing_lead', '2026-11-04', { daysRemaining: -2 }),
      clock('nh.pb.completeness', '2026-11-12'),
    ]
    expect(meetingDeadline(clocks, 'planning_board')).toEqual({
      label: 'Completeness',
      due: '2026-11-12',
    })
  })

  it('reads the hearing deadline for the zoning board, not the later decision deadline', () => {
    const clocks = [
      clock('nh.zba.decision', '2027-01-20', { daysRemaining: 75 }),
      clock('nh.zba.hearing', '2026-12-06', { daysRemaining: 30 }),
    ]
    expect(meetingDeadline(clocks, 'zba')?.due).toBe('2026-12-06')
  })

  it('uses the current due date after an adjustment', () => {
    const clocks = [clock('nh.pb.completeness', '2026-11-20', { computedDue: '2026-11-12' })]
    expect(meetingDeadline(clocks, 'planning_board')?.due).toBe('2026-11-20')
  })

  it('has no deadline once the clock is met', () => {
    const clocks = [clock('nh.pb.completeness', '2026-11-12', { status: 'met' })]
    expect(meetingDeadline(clocks, 'planning_board')).toBeNull()
  })
})

describe('meeting choices against the deadline', () => {
  const deadline = { label: 'Completeness', due: '2026-11-12' as never }

  it('marks a meeting on the due date as meeting it and a later one as after it', () => {
    expect(meetingOptionText(MEETINGS[0] as never, deadline)).toBe(
      'November 12, 2026, regular meeting · meets the deadline',
    )
    expect(meetingOptionText(MEETINGS[1] as never, deadline)).toBe(
      'November 25, 2026, regular meeting · after the deadline',
    )
    expect(meetingOptionText(MEETINGS[1] as never, null)).toBe('November 25, 2026, regular meeting')
  })

  it('finds a conflict when the meeting set is after the due date and offers the latest meeting that meets it', () => {
    const meetings = [
      { id: 'm10', date: '2026-11-10', text: 'November 10', filedInTime: true, noticeable: true },
      ...MEETINGS,
    ]
    expect(meetingConflict({ ...PLANNING, meetings }, deadline)).toEqual({
      warning:
        'The meeting set, November 25, 2026, is after this deadline: Completeness, November 12, 2026.',
      target: 'm12',
    })
  })

  it('offers no target when no upcoming meeting meets the due date', () => {
    const late = { label: 'Completeness', due: '2026-11-05' as never }
    expect(meetingConflict(PLANNING, late)).toEqual({
      warning:
        'The meeting set, November 25, 2026, is after this deadline: Completeness, November 5, 2026. No upcoming meeting is on or before it.',
      target: null,
    })
  })

  it('finds no conflict for a meeting on the due date, a past meeting, or no meeting', () => {
    const onDue = { ...PLANNING, acceptanceMeetingId: 'm12', acceptanceDate: '2026-11-12' }
    expect(meetingConflict(onDue, deadline)).toBeNull()
    const past = { ...PLANNING, acceptanceDate: '2026-11-02', acceptanceText: 'November 2, 2026' }
    expect(meetingConflict(past, { ...deadline, due: '2026-11-01' as never })).toBeNull()
    const unset = { ...PLANNING, acceptanceMeetingId: null, acceptanceDate: null }
    expect(meetingConflict(unset, deadline)).toBeNull()
    expect(meetingConflict(PLANNING, null)).toBeNull()
  })

  it('never offers a meeting the application was filed too late for', () => {
    const meetings = MEETINGS.map((m) => (m.id === 'm12' ? { ...m, filedInTime: false } : m))
    expect(meetingConflict({ ...PLANNING, meetings }, deadline)).toEqual({
      warning:
        'The meeting set, November 25, 2026, is after this deadline: Completeness, November 12, 2026. The application was filed too late for every meeting on or before it.',
      target: null,
    })
    expect(meetingOptionText(meetings[0] as never, deadline)).toBe(
      'November 12, 2026, regular meeting · filed too late for this meeting',
    )
  })

  it('never offers a meeting there is no longer time to mail notice for', () => {
    const meetings = MEETINGS.map((m) => (m.id === 'm12' ? { ...m, noticeable: false } : m))
    expect(meetingConflict({ ...PLANNING, meetings }, deadline)).toEqual({
      warning:
        'The meeting set, November 25, 2026, is after this deadline: Completeness, November 12, 2026. There is not enough time left to mail notice for any meeting on or before it.',
      target: null,
    })
    expect(meetingOptionText(meetings[0] as never, deadline)).toBe(
      'November 12, 2026, regular meeting · too soon to mail notice',
    )
  })

  it('offers the latest meeting that is both filed in time and noticeable', () => {
    const meetings = [
      { id: 'm05', date: '2026-11-05', text: 'November 5', filedInTime: false, noticeable: true },
      { id: 'm08', date: '2026-11-08', text: 'November 8', filedInTime: true, noticeable: true },
      ...MEETINGS.map((m) => (m.id === 'm12' ? { ...m, noticeable: false } : m)),
    ]
    const today = { ...PLANNING, meetings, today: '2026-11-04' }
    expect(meetingConflict(today, deadline)?.target).toBe('m08')
  })

  it('says the filing came too late before it says notice is too soon', () => {
    const both = { ...MEETINGS[0], filedInTime: false, noticeable: false } as never
    expect(meetingOptionText(both, deadline)).toBe(
      'November 12, 2026, regular meeting · filed too late for this meeting',
    )
  })

  it('repeats the chosen meeting mark as a sentence under the picker', () => {
    expect(meetingHint(MEETINGS[0] as never, deadline)).toBe('This meeting meets the deadline.')
    expect(meetingHint(MEETINGS[1] as never, deadline)).toBe('This meeting is after the deadline.')
    expect(meetingHint({ ...MEETINGS[0], noticeable: false } as never, deadline)).toBe(
      'It is too soon to mail notice for this meeting.',
    )
    expect(meetingHint({ ...MEETINGS[0], filedInTime: false } as never, deadline)).toBe(
      'The application was filed too late for this meeting.',
    )
    expect(meetingHint(MEETINGS[1] as never, null)).toBeUndefined()
  })
})
