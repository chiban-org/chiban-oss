import { describe, expect, it } from 'vitest'
import {
  accountLinksAt,
  accountLinksFor,
  currentNavHref,
  PRIMARY_NAV,
} from '@/features/publicSite/publicNav'

const labels = (links: readonly { label: string }[]) => links.map((l) => l.label)

describe('public navigation', () => {
  it('leads with parcels, meetings and reporting, and emphasises only applying for a permit', () => {
    expect(labels(PRIMARY_NAV)).toEqual([
      'Parcels',
      'Meetings',
      'Report a problem',
      'Apply for a permit',
    ])
    expect(PRIMARY_NAV.filter((l) => l.emphasis === true).map((l) => l.href)).toEqual([
      '/portal/apply',
    ])
  })

  it('offers only sign in to a signed-out visitor', () => {
    expect(labels(accountLinksFor(null))).toEqual(['Sign in'])
  })

  it('gives a resident their applications and account', () => {
    expect(labels(accountLinksFor({ kind: 'public', roles: ['applicant'] }))).toEqual([
      'Your applications',
      'Account',
    ])
  })

  it('adds contractor projects for a contractor', () => {
    expect(labels(accountLinksFor({ kind: 'public', roles: ['contractor'] }))).toEqual([
      'Your applications',
      'Contractor projects',
      'Account',
    ])
  })

  it('adds your board for a board member', () => {
    const links = accountLinksFor({ kind: 'public', roles: ['board_member'] })
    expect(labels(links)).toEqual(['Your applications', 'Your board', 'Account'])
    expect(links.find((l) => l.label === 'Your board')?.href).toBe('/board')
  })

  it('adds the staff site for staff, and both for a staff board member', () => {
    expect(labels(accountLinksFor({ kind: 'staff', roles: ['staff'] }))).toEqual([
      'Your applications',
      'Staff site',
      'Account',
    ])
    expect(labels(accountLinksFor({ kind: 'staff', roles: ['board_member'] }))).toEqual([
      'Your applications',
      'Your board',
      'Staff site',
      'Account',
    ])
  })

  it('marks the most specific entry that contains the current path', () => {
    const links = [...PRIMARY_NAV, ...accountLinksFor({ kind: 'public', roles: ['contractor'] })]
    expect(currentNavHref('/parcels/abc', links)).toBe('/parcels')
    expect(currentNavHref('/portal/apply', links)).toBe('/portal/apply')
    expect(currentNavHref('/portal/applications/x', links)).toBe('/portal')
    expect(currentNavHref('/portal/contractor', links)).toBe('/portal/contractor')
    expect(currentNavHref('/complaints/received', links)).toBe('/complaints/new')
    expect(currentNavHref('/report-anonymously', links)).toBe('/complaints/new')
    expect(currentNavHref('/meetingsx', links)).toBeNull()
    expect(currentNavHref('/', links)).toBeNull()
  })

  it('offers no sign in on a private packet link, whose readers may have no account', () => {
    expect(labels(accountLinksAt(accountLinksFor(null), '/board/packets/abc'))).toEqual([])
    expect(labels(accountLinksAt(accountLinksFor(null), '/board'))).toEqual(['Sign in'])
    const member = accountLinksFor({ kind: 'public', roles: ['board_member'] })
    expect(accountLinksAt(member, '/board/packets/abc')).toEqual(member)
  })
})
