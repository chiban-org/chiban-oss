import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import { gateRow, type RowFacts } from './requirementRows'
import type { PlanActionKind } from './workPlanTypes'

function closing(reason: string | null): GateResult {
  return {
    key: 'closure.requirement_met',
    label: 'Closing requirement met',
    citation: null,
    kind: 'administrative',
    outcome: reason === null ? { status: 'pass' } : { status: 'blocked', reason },
    override: null,
    effective: reason === null ? 'pass' : 'blocked',
  }
}

function facts(closure: RowFacts['closure'], abilities: PlanActionKind[]): RowFacts {
  return {
    reviewers: 0,
    regionalDetermined: false,
    commissionNotified: false,
    abilities: new Set(abilities),
    closure,
  }
}

const NO_FINAL = 'No final inspection has passed.'
const NO_CERT = 'No certificate of occupancy has been issued.'

describe('the closing requirement row', () => {
  it('keeps the default copy when nothing is known about inspections', () => {
    const row = gateRow(closing(NO_FINAL), facts(undefined, []))
    expect(row).toMatchObject({ task: 'Finish the final inspection', actor: 'inspector' })
  })

  it('says to book the final inspection when none is requested', () => {
    const row = gateRow(
      closing(NO_FINAL),
      facts({ stage: 'none', reinspectId: null, dueFinal: false }, ['take_inspection_request']),
    )
    expect(row).toMatchObject({
      task: 'Book the final inspection',
      actor: 'town',
      action: { kind: 'take_inspection_request' },
    })
  })

  it('says to book the final inspection for a certificate type with no passed final', () => {
    const reason =
      'No final inspection has passed, so the certificate of occupancy cannot be issued yet.'
    const row = gateRow(
      closing(reason),
      facts({ stage: 'none', reinspectId: null, dueFinal: false }, ['take_inspection_request']),
    )
    expect(row.task).toBe('Book the final inspection')
    expect(row.detail).toBe(reason)
  })

  it('offers no action when the role cannot take requests', () => {
    const row = gateRow(
      closing(NO_FINAL),
      facts({ stage: 'none', reinspectId: null, dueFinal: false }, []),
    )
    expect(row).toMatchObject({ task: 'Book the final inspection', action: null })
  })

  it('says to finish the final inspection while one is open', () => {
    const row = gateRow(
      closing(NO_FINAL),
      facts({ stage: 'open', reinspectId: null, dueFinal: false }, ['take_inspection_request']),
    )
    expect(row).toMatchObject({
      task: 'Finish the final inspection',
      actor: 'inspector',
      action: null,
    })
  })

  it('links the result form when the final is due', () => {
    const row = gateRow(
      closing(NO_FINAL),
      facts({ stage: 'open', reinspectId: null, dueFinal: true }, ['record_inspection_result']),
    )
    expect(row.action).toEqual({ kind: 'record_inspection_result' })
  })

  it('does not link a due inspection that is not the final', () => {
    const row = gateRow(
      closing(NO_FINAL),
      facts({ stage: 'open', reinspectId: null, dueFinal: false }, ['record_inspection_result']),
    )
    expect(row.action).toBeNull()
  })

  it('says to book the reinspection after a failed final', () => {
    const row = gateRow(
      closing(NO_FINAL),
      facts({ stage: 'failed', reinspectId: 'ins-1', dueFinal: false }, [
        'take_inspection_request',
      ]),
    )
    expect(row).toMatchObject({
      task: 'Book the final reinspection',
      actor: 'town',
      action: { kind: 'take_inspection_request', reinspect: 'ins-1' },
    })
  })

  it('says to issue the certificate once the final has passed', () => {
    const row = gateRow(
      closing(NO_CERT),
      facts({ stage: 'passed', reinspectId: null, dueFinal: false }, ['issue_certificate']),
    )
    expect(row).toMatchObject({
      task: 'Issue the certificate of occupancy',
      actor: 'town',
      action: { kind: 'issue_certificate' },
    })
  })

  it('has no action and no wording once the requirement is met', () => {
    const row = gateRow(
      closing(null),
      facts({ stage: 'passed', reinspectId: null, dueFinal: false }, ['issue_certificate']),
    )
    expect(row.done).toBe(true)
    expect(row.action).toBeNull()
  })
})
