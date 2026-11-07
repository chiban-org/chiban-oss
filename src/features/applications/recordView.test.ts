import { describe, expect, it } from 'vitest'
import { type RecordViewInput, recordViewFor } from './recordView'

const inspector: RecordViewInput = {
  recordsInspections: true,
  managesWorkflow: false,
  issuesPermits: false,
  state: 'issued',
  inspectionCount: 0,
}

describe('which shape of the record page a viewer gets', () => {
  it('gives the inspection view to someone who records inspections on an issued permit', () => {
    expect(recordViewFor(inspector)).toBe('inspector')
  })

  it('keeps the inspection view once a record has inspections, whatever its state', () => {
    expect(recordViewFor({ ...inspector, state: 'closed', inspectionCount: 2 })).toBe('inspector')
    expect(recordViewFor({ ...inspector, state: 'suspended', inspectionCount: 1 })).toBe(
      'inspector',
    )
  })

  it('keeps the office page before issuance, where the inspector has other work to do', () => {
    expect(recordViewFor({ ...inspector, state: 'under_review' })).toBe('office')
    expect(recordViewFor({ ...inspector, state: 'decided' })).toBe('office')
  })

  it('keeps the office page for anyone who manages the workflow or issues permits', () => {
    expect(recordViewFor({ ...inspector, managesWorkflow: true })).toBe('office')
    expect(recordViewFor({ ...inspector, issuesPermits: true })).toBe('office')
  })

  it('keeps the office page for staff who do not record inspections', () => {
    expect(recordViewFor({ ...inspector, recordsInspections: false, inspectionCount: 3 })).toBe(
      'office',
    )
  })
})
