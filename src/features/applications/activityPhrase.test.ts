import { describe, expect, it } from 'vitest'
import { ACTIVITY_PHRASES, activityPhrase } from '@/features/applications/activityPhrase'
import { registerGate } from '@/features/gates/registry'

const RAW_KEY = /[a-z]+[._][a-z_]+/

describe('activity phrases', () => {
  it('names the status an application moved to', () => {
    expect(activityPhrase('application.transition', { state: 'under_review' })).toBe(
      'Moved the application to Under review',
    )
    expect(activityPhrase('application.transition', { state: 'mystery' })).toBe(
      'Moved the application to a new status',
    )
  })

  it('names an incomplete application notice', () => {
    expect(activityPhrase('application.incomplete_notice', null)).toBe(
      'Sent an incomplete application notice',
    )
  })

  it('reads the template actions for clocks and board votes', () => {
    expect(activityPhrase('clock.extension', null)).toBe('Extended a deadline')
    expect(activityPhrase('clock.tolling', null)).toBe('Paused a deadline')
    expect(activityPhrase('board.completeness.accepted', null)).toBe(
      'Recorded the board accepting the application as complete',
    )
    expect(activityPhrase('board.certification.certified', null)).toBe(
      'Recorded the selectmen certifying the request',
    )
  })

  it('names the answers an amendment changed', () => {
    expect(
      activityPhrase('application.amend', {
        values: {},
        changes: [{ label: 'Dwelling units', from: '1', to: '2' }],
      }),
    ).toBe('Amended the application: Dwelling units from 1 to 2')
    expect(activityPhrase('application.amend', { values: {} })).toBe('Amended the application')
  })

  it('names the board comment actions', () => {
    expect(activityPhrase('review.board_assign', null)).toBe(
      'Sent the application to a board for comment',
    )
    expect(activityPhrase('review.board_withdraw', null)).toBe(
      'Withdrew a request for board comment',
    )
    expect(activityPhrase('review.board_comment', null)).toBe('Added a board comment')
  })

  it('says whether the responsible staff member was set or cleared', () => {
    expect(activityPhrase('application.responsible_staff', { responsibleUserId: null })).toBe(
      'Cleared who is responsible',
    )
    expect(activityPhrase('application.responsible_staff', { responsibleUserId: 'u1' })).toBe(
      'Changed who is responsible',
    )
  })

  it('never shows a raw action key, even for an action it does not know', () => {
    expect(activityPhrase('something.new_here', null)).toBe('Changed the record')
    for (const phrase of ACTIVITY_PHRASES.values()) {
      expect(phrase).not.toMatch(RAW_KEY)
      expect(phrase).not.toMatch(/\.$/)
    }
  })
})

describe('the gate override phrase', () => {
  it('names the gate and the reason', () => {
    registerGate({
      key: 'fernhollow.test_gate',
      label: 'Fernhollow test gate',
      kind: 'administrative',
      appliesTo: ['issued'],
      boundBy: null,
      evaluate: () => Promise.resolve({ status: 'pass' }),
    })
    expect(
      activityPhrase('gate.override', {
        gateKey: 'fernhollow.test_gate',
        reason: 'Approval confirmed by phone.',
      }),
    ).toBe('Overrode a gate: Fernhollow test gate. Reason: Approval confirmed by phone.')
    expect(activityPhrase('gate.override', { gateKey: 'unknown.gate', reason: 'Seen.' })).toBe(
      'Overrode a gate. Reason: Seen.',
    )
    expect(activityPhrase('gate.override', null)).toBe('Overrode a gate')
  })
})
