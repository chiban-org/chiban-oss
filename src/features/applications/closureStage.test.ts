import { describe, expect, it } from 'vitest'
import { closureStage, type FinalRow } from './closureStage'

function row(o: Partial<FinalRow> & { id: string }): FinalRow {
  return { isFinal: true, status: 'requested', resultRecordedAt: null, ...o }
}

describe('the closing stage of a permit', () => {
  it('is none with no inspections', () => {
    expect(closureStage([], new Set())).toEqual({ stage: 'none', reinspectId: null })
  })

  it('ignores inspections that are not final', () => {
    expect(
      closureStage([row({ id: 'a', isFinal: false, status: 'scheduled' })], new Set()),
    ).toEqual({ stage: 'none', reinspectId: null })
  })

  it('is open while a final is requested or scheduled', () => {
    expect(closureStage([row({ id: 'a', status: 'scheduled' })], new Set()).stage).toBe('open')
    expect(closureStage([row({ id: 'a', status: 'requested' })], new Set()).stage).toBe('open')
  })

  it('is passed once a final has passed', () => {
    expect(closureStage([row({ id: 'a', status: 'passed' })], new Set()).stage).toBe('passed')
  })

  it('is failed with the reinspectable failure when the latest final failed', () => {
    const rows = [
      row({ id: 'a', status: 'failed', resultRecordedAt: new Date('2026-11-01') }),
      row({ id: 'b', status: 'failed', resultRecordedAt: new Date('2026-11-05') }),
    ]
    expect(closureStage(rows, new Set(['b']))).toEqual({ stage: 'failed', reinspectId: 'b' })
  })

  it('is open when a reinspection is already requested after a failure', () => {
    const rows = [
      row({ id: 'a', status: 'failed', resultRecordedAt: new Date('2026-11-01') }),
      row({ id: 'b', status: 'requested' }),
    ]
    expect(closureStage(rows, new Set()).stage).toBe('open')
  })

  it('is failed when a final failed after an earlier one passed', () => {
    const rows = [
      row({ id: 'a', status: 'passed', resultRecordedAt: new Date('2026-11-01') }),
      row({ id: 'b', status: 'failed', resultRecordedAt: new Date('2026-11-05') }),
    ]
    expect(closureStage(rows, new Set(['b']))).toEqual({ stage: 'failed', reinspectId: 'b' })
  })

  it('ignores cancelled finals', () => {
    expect(closureStage([row({ id: 'a', status: 'cancelled' })], new Set()).stage).toBe('none')
  })
})
