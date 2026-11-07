import { describe, expect, it } from 'vitest'
import {
  audiencesFor,
  publicChip,
  publicStateOf,
  publicViewHref,
  showNote,
  type VisibilityInput,
  whoCanSeeSentence,
} from '@/features/documents/whoCanSee'

function input(overrides: Partial<VisibilityInput> = {}): VisibilityInput {
  return {
    recordKind: 'application',
    audiences: ['project_parties'],
    isPublic: false,
    rendition: 'none',
    approvedRole: null,
    caseIsPublic: null,
    parcelId: 'p1',
    ...overrides,
  }
}

const shownOriginal = { isPublic: true, rendition: 'approved', approvedRole: 'original' } as const

describe('who can see a document', () => {
  it('names everyone and the parcel page when the original is shown on the public site', () => {
    expect(whoCanSeeSentence(input(shownOriginal))).toBe(
      'Everyone. Shown on the public site on the parcel page, as the original.',
    )
  })

  it('names the redacted copy when that is the approved version', () => {
    expect(whoCanSeeSentence(input({ ...shownOriginal, approvedRole: 'public_redacted' }))).toBe(
      'Everyone. Shown on the public site on the parcel page, as the redacted copy.',
    )
  })

  it('does not claim a parcel page when the record has no parcel', () => {
    expect(
      whoCanSeeSentence(
        input({
          ...shownOriginal,
          recordKind: 'enforcement_case',
          caseIsPublic: true,
          parcelId: null,
        }),
      ),
    ).toBe(
      'Everyone. Shown on the public site only through its link, as the original: the record has no parcel, so no parcel page lists it.',
    )
  })

  it('says no copy is approved yet for a private document with nothing approved', () => {
    expect(
      whoCanSeeSentence(input({ audiences: ['project_parties', 'reviewers'], rendition: 'none' })),
    ).toBe(
      'Town staff, project parties and assigned reviewers. Not on the public site: no copy is approved for the public yet.',
    )
  })

  it('says no copy is approved yet when the switch is on but the approval was revoked', () => {
    expect(whoCanSeeSentence(input({ isPublic: true, rendition: 'public_no_copy' }))).toBe(
      'Town staff and project parties. Not on the public site: no copy is approved for the public yet.',
    )
  })

  it('names a redacted copy waiting for approval and a revoked approval', () => {
    expect(whoCanSeeSentence(input({ rendition: 'redacted_waiting' }))).toBe(
      'Town staff and project parties. Not on the public site: the redacted copy is waiting for approval.',
    )
    expect(whoCanSeeSentence(input({ rendition: 'revoked' }))).toBe(
      'Town staff and project parties. Not on the public site: the public approval was revoked.',
    )
  })

  it('says an approved copy can be shown when only the switch is off', () => {
    expect(
      whoCanSeeSentence(input({ rendition: 'approved', approvedRole: 'public_redacted' })),
    ).toBe(
      'Town staff and project parties. Not on the public site. The redacted copy is approved for the public, so it can be shown.',
    )
  })

  it('keeps a document on a private case off the public site, as visibility does', () => {
    const doc = input({
      ...shownOriginal,
      recordKind: 'enforcement_case',
      audiences: [],
      caseIsPublic: false,
    })
    expect(publicStateOf(doc)).toEqual({
      shown: false,
      switchOn: true,
      blockers: ['case_private'],
    })
    expect(whoCanSeeSentence(doc)).toBe(
      'Town staff only. Not on the public site: the case is not public.',
    )
  })

  it('names both blockers when nothing is approved and the case is private', () => {
    expect(
      whoCanSeeSentence(
        input({
          recordKind: 'enforcement_case',
          audiences: [],
          isPublic: true,
          rendition: 'public_no_copy',
          caseIsPublic: false,
        }),
      ),
    ).toBe(
      'Town staff only. Not on the public site: no copy is approved for the public yet, and the case is not public.',
    )
  })

  it('never shows Right-to-Know documents on the public site', () => {
    expect(
      whoCanSeeSentence(input({ ...shownOriginal, recordKind: 'rtk_request', audiences: [] })),
    ).toBe(
      'Town staff only. Not on the public site: Right-to-Know documents are never shown there.',
    )
  })

  it('names every audience that grants signed-in access on the record', () => {
    expect(
      whoCanSeeSentence(
        input({ audiences: ['board', 'project_parties', 'reviewers'], rendition: 'none' }),
      ),
    ).toBe(
      'Town staff, project parties, assigned reviewers and board members. Not on the public site: no copy is approved for the public yet.',
    )
  })

  it('leaves out audiences that grant nothing on the record kind', () => {
    expect(
      whoCanSeeSentence(
        input({
          recordKind: 'parcel',
          audiences: ['project_parties', 'reviewers', 'board'],
          rendition: 'none',
        }),
      ),
    ).toBe('Town staff only. Not on the public site: no copy is approved for the public yet.')
    expect(audiencesFor('parcel')).toEqual([])
    expect(audiencesFor('enforcement_case')).toEqual([])
    expect(audiencesFor('application')).toEqual(['project_parties', 'reviewers', 'board'])
    expect(audiencesFor('inspection')).toEqual(['project_parties'])
  })
})

describe('the public chip', () => {
  it('reads Shown on the public site only when the document is shown', () => {
    expect(publicChip(input(shownOriginal))).toEqual({
      status: 'passed',
      label: 'Shown on the public site',
    })
  })

  it('reads Not on the public site for a document on a private case', () => {
    expect(
      publicChip(
        input({
          ...shownOriginal,
          recordKind: 'enforcement_case',
          caseIsPublic: false,
        }),
      ),
    ).toEqual({ status: 'failed', label: 'Not on the public site' })
  })

  it('marks a waiting redacted copy and leaves a plain private document neutral', () => {
    expect(publicChip(input({ rendition: 'redacted_waiting' }))).toEqual({
      status: 'overdue',
      label: 'Not on the public site',
    })
    expect(publicChip(input())).toEqual({ status: 'neutral', label: 'Not on the public site' })
  })
})

describe('the public view link', () => {
  it('points at the public parcel page only for a shown document with a parcel', () => {
    expect(publicViewHref(input(shownOriginal))).toBe('/parcels/p1')
    expect(publicViewHref(input({ ...shownOriginal, parcelId: null }))).toBeNull()
    expect(publicViewHref(input())).toBeNull()
  })
})

describe('the note beside the public switch', () => {
  it('says where the approved copy shows', () => {
    expect(showNote(input())).toBe(
      'Shows the approved copy to signed-out visitors on the parcel page.',
    )
    expect(showNote(input({ parcelId: null }))).toBe(
      'Shows the approved copy to anyone with its link. The record has no parcel, so no public page lists it.',
    )
  })

  it('says a case document shows only while the case is public', () => {
    expect(showNote(input({ recordKind: 'enforcement_case', caseIsPublic: false }))).toBe(
      'Shows the approved copy to signed-out visitors on the parcel page, only while the case is public.',
    )
  })
})
