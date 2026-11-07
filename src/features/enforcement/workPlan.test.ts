import { describe, expect, it } from 'vitest'
import { ALL_CASE_ABILITIES, OPEN_FINDING, planFor, planInput, planOrder } from '@/test/casePlan'
import { hostedActions } from './workPlanTypes'

describe('the case work plan before an order is issued', () => {
  it('asks the town to start the investigation at intake', () => {
    const p = planFor(planInput('intake'))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Start the investigation.')
    expect(p.now?.action).toEqual({ kind: 'move', to: 'investigating' })
    expect(p.moves).toEqual([])
  })

  it('names only the town when nobody is assigned', () => {
    const p = planFor(planInput('intake'), { abilities: ALL_CASE_ABILITIES, responsible: null })
    expect(p.sentence).toBe('Waiting on: Town. Start the investigation.')
  })

  it('asks for a finding while investigating and offers no violation as a move', () => {
    const p = planFor(planInput('investigating'))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Record a finding.')
    expect(p.now?.action).toEqual({ kind: 'record_finding' })
    expect(p.moves).toEqual(['no_violation'])
    expect(p.groups.map((g) => g.title)).toEqual(['Before a violation is found'])
  })

  it('asks for a notice once a violation is found and no notice was sent', () => {
    const p = planFor(planInput('violation_found', { findings: OPEN_FINDING }))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Send a notice of violation.')
    expect(p.now?.action).toEqual({ kind: 'send_notice' })
    expect(p.moves).toEqual(['resolved'])
  })

  it('asks for the receipt of a notice that was sent', () => {
    const p = planFor(
      planInput('violation_found', {
        findings: OPEN_FINDING,
        notices: [{ id: 'n1', receivedOn: null }],
      }),
    )
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Record when the notice was received.')
    expect(p.now?.action).toEqual({ kind: 'record_notice_receipt', noticeId: 'n1' })
    expect([...hostedActions(p)]).toEqual(['record_notice_receipt:n1'])
  })

  it('asks for an order once the notice was received and lists the order requirements', () => {
    const p = planFor(
      planInput('violation_found', {
        findings: OPEN_FINDING,
        notices: [{ id: 'n1', receivedOn: '2026-11-02' }],
      }),
    )
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Draft a cease and desist order.')
    expect(p.now?.action).toEqual({ kind: 'draft_order' })
    expect(p.groups[0]?.title).toBe('Before the order is issued')
    expect(p.groups[0]?.rows.map((r) => [r.label, r.done])).toEqual([
      ['Finding recorded', true],
      ['Notice of violation sent', true],
      ['Receipt of the notice recorded', true],
      ['Order drafted', false],
      ['Order issued', false],
    ])
  })

  it('asks to issue a draft order', () => {
    const draft = planOrder({}, { status: 'draft', issuedOn: null })
    const p = planFor(planInput('violation_found', { findings: OPEN_FINDING, orders: [draft] }))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Issue order CD-2026-0001.')
    expect(p.now?.action).toEqual({ kind: 'issue_order', orderId: 'o1' })
    expect(p.now?.note).toBeNull()
  })

  it('notes a draft order with no corrective action written', () => {
    const draft = planOrder({}, { status: 'draft', issuedOn: null, correctiveAction: '' })
    const p = planFor(planInput('violation_found', { findings: OPEN_FINDING, orders: [draft] }))
    expect(p.now?.note).toBe('Write the corrective action in the draft before issuing it.')
  })

  it('asks to close a resolved case and keeps the close move out of more actions', () => {
    const p = planFor(planInput('resolved', { findings: OPEN_FINDING }))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Close the case.')
    expect(p.now?.action).toEqual({ kind: 'move', to: 'closed' })
    expect(p.moves).toEqual([])
  })

  it.each([
    ['closed', 'This case is closed.', []],
    ['no_violation', 'No violation was found.', ['closed']],
  ] as const)('reads only the outcome when %s', (status, sentence, moves) => {
    const p = planFor(planInput(status))
    expect(p.sentence).toBe(sentence)
    expect(p.now).toBeNull()
    expect(p.groups).toEqual([])
    expect(p.moves).toEqual(moves)
  })

  it('names the step without a form when the viewer cannot take it', () => {
    const p = planFor(planInput('investigating'), {
      abilities: new Set(),
      responsible: 'Sam Clerk',
    })
    expect(p.now?.task).toBe('Record a finding')
    expect(p.now?.action).toBeNull()
    expect(p.now?.note).toBe('Your role cannot take this step.')
    expect(p.moves).toEqual([])
  })
})
