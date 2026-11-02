import { describe, expect, it } from 'vitest'
import { canonicalJson } from '@/features/snapshots/canonicalJson'
import { type ApplicationSnapshotBody, publicSnapshotView } from '@/features/snapshots/publicView'

const BODY: ApplicationSnapshotBody = {
  applicationNumber: 'BP-2027-0001',
  applicationTypeKey: 'BP',
  configPins: {
    applicationType: 'a',
    form: 'f',
    feeSchedule: 's',
    conditionLibrary: 'c',
    checklists: [],
    templates: [],
  },
  form: {
    key: 'f',
    label: 'Form',
    fields: [
      { key: 'scope', label: 'Scope', type: 'text', required: true },
      { key: 'contact_email', label: 'Contact email', type: 'email', required: false },
      { key: 'contact_phone', label: 'Contact phone', type: 'phone', required: false },
    ],
  },
  values: { scope: 'Garage', contact_email: 'a@alderpond.example', contact_phone: '603-555-0142' },
  facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
  parties: [{ role: 'applicant', name: 'Alex Applicant', email: 'alex@alderpond.example' }],
  attestation: { userId: 'u', statementSha256: 'h', attestedAt: '2027-03-02T15:00:00.000Z' },
  attachments: [],
  receivedDate: '2027-03-02' as never,
  capturedAt: '2027-03-02T15:00:00.000Z',
}

describe('publicSnapshotView', () => {
  it('public view drops email and phone fields and party emails', () => {
    const view = publicSnapshotView(BODY)
    expect(view.values).toEqual({ scope: 'Garage' })
    expect(view.form.fields.map((f) => f.key)).toEqual(['scope'])
    expect(view.parties).toEqual([{ role: 'applicant', name: 'Alex Applicant' }])
    expect(JSON.stringify(view)).not.toContain('555-0142')
    expect(JSON.stringify(view)).not.toContain('alderpond.example')
  })
})

describe('canonicalJson', () => {
  it('body hash input is stable across key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [3, { x: 2, y: 1 }] }, b: 1 }),
    )
  })
})
