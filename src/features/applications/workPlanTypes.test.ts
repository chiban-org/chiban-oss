import { describe, expect, it } from 'vitest'
import {
  addRequirement,
  addWarning,
  hostedActions,
  type Requirement,
  type WorkPlan,
} from './workPlanTypes'

const ROW: Requirement = {
  key: 'abutters.list_issued',
  label: 'Abutter list issued',
  done: false,
  detail: '',
  task: 'Issue the abutter list',
  actor: 'town',
  anchor: 'board',
  action: { kind: 'record_payment' },
  gate: null,
}

const PLAN: WorkPlan = {
  state: 'submitted',
  sentence: 'Waiting on: Town. Set the acceptance meeting.',
  now: {
    key: 'board.meeting',
    task: 'Set the acceptance meeting',
    actor: 'town',
    note: null,
    action: { kind: 'set_board_meeting' },
    secondary: [{ kind: 'move', to: 'issued' }],
    warnings: [],
  },
  groups: [{ to: 'under_review', title: 'Before the hearing', rows: [] }],
  terminal: ['withdrawn'],
}

describe('extending a work plan', () => {
  it('adds a warning inside the card', () => {
    const warned = addWarning(PLAN, {
      key: 'meeting.late',
      text: 'The meeting is after the due date.',
    })
    expect(warned.now?.warnings).toEqual([
      { key: 'meeting.late', text: 'The meeting is after the due date.' },
    ])
    expect(PLAN.now?.warnings).toEqual([])
    expect(addWarning({ ...PLAN, now: null }, { key: 'x', text: 'y' }).now).toBeNull()
  })

  it('adds a row to an existing group, or a new group when none matches', () => {
    expect(
      addRequirement(PLAN, { to: 'under_review', title: 'Before the hearing' }, ROW).groups[0]
        ?.rows,
    ).toEqual([ROW])
    const added = addRequirement(PLAN, { to: 'issued', title: 'Before it can be issued' }, ROW)
    expect(added.groups.map((g) => g.title)).toEqual([
      'Before the hearing',
      'Before it can be issued',
    ])
  })

  it('names every inline form the card and the open rows hold, but not moves', () => {
    const plan = addRequirement(PLAN, { to: 'under_review', title: 'Before the hearing' }, ROW)
    expect([...hostedActions(plan)].sort()).toEqual(['record_payment', 'set_board_meeting'])
    const done = addRequirement(
      PLAN,
      { to: 'under_review', title: 'Before the hearing' },
      { ...ROW, done: true },
    )
    expect([...hostedActions(done)]).toEqual(['set_board_meeting'])
  })
})
