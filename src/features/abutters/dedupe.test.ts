import { describe, expect, it } from 'vitest'
import { dedupeKey, mergeRecipients } from '@/features/abutters/dedupe'
import type { Recipient } from '@/features/abutters/resolution'

function recipient(overrides: Partial<Recipient>): Recipient {
  return {
    key: 'k',
    roles: ['abutter_owner'],
    name: 'Wren, Isolde',
    mailingAddress: 'PO Box 302, Alder Pond NH',
    parcelIds: ['p1'],
    channelHint: 'verified_mail',
    status: 'ok',
    provenance: [
      { source: 'parcel_record', ref: 'p1', asOf: '2027-03-01', ageDays: 23, state: 'fresh' },
    ],
    ...overrides,
  }
}

describe('dedupeKey', () => {
  it('dedupe key ignores case and punctuation', () => {
    expect(dedupeKey('Wren, Isolde', 'PO Box 302, Alder Pond NH')).toBe(
      dedupeKey('WREN ISOLDE', 'po box 302 alder   pond nh.'),
    )
  })

  it('different addresses differ', () => {
    expect(dedupeKey('Wren, Isolde', 'PO Box 302')).not.toBe(
      dedupeKey('Wren, Isolde', 'PO Box 303'),
    )
  })
})

describe('mergeRecipients', () => {
  it('merges the same name and address, keeping every role, parcel, and provenance entry', () => {
    const merged = mergeRecipients([
      recipient({}),
      recipient({
        roles: ['applicant'],
        parcelIds: ['p2'],
        provenance: [
          { source: 'application_form', ref: 'a1', asOf: null, ageDays: null, state: 'entered' },
        ],
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.roles).toEqual(['abutter_owner', 'applicant'])
    expect(merged[0]?.parcelIds).toEqual(['p1', 'p2'])
    expect(merged[0]?.provenance.map((p) => p.source)).toEqual([
      'parcel_record',
      'application_form',
    ])
  })

  it('never merges recipients with no address', () => {
    const merged = mergeRecipients([
      recipient({ mailingAddress: null, status: 'incomplete_data' }),
      recipient({ mailingAddress: null, status: 'incomplete_data', parcelIds: ['p2'] }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('a merged recipient needing a decision still needs it', () => {
    const merged = mergeRecipients([recipient({}), recipient({ status: 'needs_decision' })])
    expect(merged[0]?.status).toBe('needs_decision')
  })

  it('the strictest channel wins when mailings merge', () => {
    const merged = mergeRecipients([
      recipient({ channelHint: 'first_class_mail' }),
      recipient({ channelHint: 'certified_mail' }),
    ])
    expect(merged[0]?.channelHint).toBe('certified_mail')
  })
})
