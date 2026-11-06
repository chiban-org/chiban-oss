import { describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import type { HomeSection } from '@/features/staffHome/homeTypes'
import { orderSections, shownRows, startPageFor } from '@/features/staffHome/startPage'
import type { NavViewer } from '@/features/staffNav/navTypes'

const GRANTS = new Map(Object.entries(DEFAULT_GRANTS))

function viewerOf(...roles: Role[]): NavViewer {
  return {
    roles,
    capabilities: new Set<Capability>(roles.flatMap((role) => GRANTS.get(role) ?? [])),
  }
}

function section(key: HomeSection['key'], urgency: number): HomeSection {
  return { key, title: key, urgency, rows: [], links: [], detail: null }
}

describe('the staff start page for each role', () => {
  it('gives each working role its own sections', () => {
    for (const role of ['admin', 'staff', 'inspector', 'finance', 'records_custodian'] as const) {
      expect(startPageFor(viewerOf(role))).toEqual({ kind: 'home', roles: [role] })
    }
  })

  it('sends a reviewer to their reviews and a board member to the board page', () => {
    expect(startPageFor(viewerOf('reviewer'))).toEqual({ kind: 'redirect', to: '/staff/reviews' })
    expect(startPageFor(viewerOf('board_member'))).toEqual({ kind: 'redirect', to: '/board' })
    expect(startPageFor(viewerOf())).toEqual({ kind: 'redirect', to: '/staff/parcels' })
  })

  it('shows a person with several roles the sections of each role they hold', () => {
    expect(startPageFor(viewerOf('finance', 'inspector', 'board_member'))).toEqual({
      kind: 'home',
      roles: ['inspector', 'finance', 'board_member'],
    })
    expect(startPageFor(viewerOf('staff', 'reviewer'))).toEqual({
      kind: 'home',
      roles: ['staff', 'reviewer'],
    })
  })
})

describe('section order and rows', () => {
  it('puts the most urgent section first and keeps area order on a tie', () => {
    const ordered = orderSections([
      section('packets', 0),
      section('applications', 0),
      section('payments', 2),
      section('inspections', 5),
      section('enforcement', 2),
      section('system', 0),
    ])
    expect(ordered.map((s) => s.key)).toEqual([
      'inspections',
      'payments',
      'enforcement',
      'system',
      'applications',
      'packets',
    ])
  })

  it('drops rows with a zero count so the section can say nothing is waiting', () => {
    const rows = [
      { label: 'Past a deadline', count: 0, href: '/a' },
      { label: 'Submitted', count: 3, href: '/b' },
    ]
    expect(shownRows({ ...section('applications', 0), rows })).toEqual([rows[1]])
  })
})
