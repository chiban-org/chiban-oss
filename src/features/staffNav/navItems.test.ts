import { describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import {
  activeNavHref,
  groupNavItems,
  isNested,
  NAV_GROUPS,
  NAV_ICONS,
  navItemsFor,
  STAFF_NAV_ITEMS,
} from '@/features/staffNav/navItems'

function labelsFor(role: Role): string[] {
  const capabilities = new Set<Capability>(DEFAULT_GRANTS[role] ?? [])
  return navItemsFor({ roles: [role], capabilities }).map((i) => i.label)
}

describe('staff navigation', () => {
  it('has one entry per href', () => {
    const hrefs = STAFF_NAV_ITEMS.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('shows the records custodian the records pages and not payments or the schedule board', () => {
    const labels = labelsFor('records_custodian')
    expect(labels).toContain('Preservation')
    expect(labels).toContain('Legal holds')
    expect(labels).not.toContain('Payments')
    expect(labels).not.toContain('Board packets')
    expect(labels).not.toContain('Counter')
  })

  it('hides payments and board packets from the inspector and keeps the day list', () => {
    const labels = labelsFor('inspector')
    expect(labels).not.toContain('Payments')
    expect(labels).not.toContain('Board packets')
    expect(labels).toContain('My day')
    expect(labels).toContain('Inspections')
  })

  it('shows a board member only the pages that are not record workflows', () => {
    const labels = labelsFor('board_member')
    for (const hidden of ['Applications', 'Reviews', 'Payments', 'Counter', 'Reports']) {
      expect(labels).not.toContain(hidden)
    }
    expect(labels).toContain('Parcels')
    expect(labels).toContain('Account')
  })

  it('shows the boards and rosters pages to staff and admin only', () => {
    for (const role of ['staff', 'admin'] as const) {
      expect(labelsFor(role)).toEqual(expect.arrayContaining(['Board applications', 'Rosters']))
    }
    for (const role of [
      'reviewer',
      'board_member',
      'inspector',
      'finance',
      'records_custodian',
    ] as const) {
      const labels = labelsFor(role)
      expect(labels).not.toContain('Board applications')
      expect(labels).not.toContain('Rosters')
    }
  })

  it('shows a reviewer reviews and applications but not the day list', () => {
    const labels = labelsFor('reviewer')
    expect(labels).toContain('Reviews')
    expect(labels).toContain('Applications')
    expect(labels).not.toContain('My day')
    for (const hidden of ['Imports', 'Exceptions', 'Unresolved records', 'Overrides', 'Settings']) {
      expect(labels).not.toContain(hidden)
    }
    expect(labelsFor('staff')).toEqual(
      expect.arrayContaining([
        'Imports',
        'Exceptions',
        'Unresolved records',
        'Overrides',
        'Settings',
      ]),
    )
  })

  it('shows admin the administration pages and finance the payments page', () => {
    expect(labelsFor('admin')).toEqual(expect.arrayContaining(['Export', 'Health', 'Cutover']))
    expect(labelsFor('finance')).toContain('Payments')
    expect(labelsFor('finance')).not.toContain('Health')
  })

  it('every item is visible to at least one default role', () => {
    const everyRole: Role[] = [
      'admin',
      'staff',
      'inspector',
      'finance',
      'records_custodian',
      'reviewer',
      'board_member',
    ]
    const seen = new Set(everyRole.flatMap(labelsFor))
    expect(STAFF_NAV_ITEMS.map((i) => i.label).filter((l) => !seen.has(l))).toEqual([])
  })

  it('groups the staff nav in a fixed order and drops empty groups', () => {
    const inspector = navItemsFor({
      roles: ['inspector'],
      capabilities: new Set<Capability>(DEFAULT_GRANTS.inspector ?? []),
    })
    const sections = groupNavItems(inspector)
    expect(sections.every((s) => s.items.length > 0)).toBe(true)
    expect(sections.flatMap((s) => s.items).length).toBe(inspector.length)
    expect(sections.at(-1)?.key).toBe('account')
  })

  it('marks the most specific nav entry for a nested page as active', () => {
    expect(activeNavHref('/staff/inspections/day', STAFF_NAV_ITEMS)).toBe('/staff/inspections/day')
    expect(activeNavHref('/staff/inspections/123', STAFF_NAV_ITEMS)).toBe('/staff/inspections')
    expect(activeNavHref('/staff/boards/members', STAFF_NAV_ITEMS)).toBe('/staff/boards/members')
    expect(activeNavHref('/staff/applicationsx', STAFF_NAV_ITEMS)).toBeNull()
  })

  it('nests My day under Inspections only when the person also sees Inspections', () => {
    const day = STAFF_NAV_ITEMS.find((i) => i.href === '/staff/inspections/day')
    if (day === undefined) throw new Error('My day missing')
    expect(isNested(day, STAFF_NAV_ITEMS)).toBe(true)
    expect(isNested(day, [day])).toBe(false)
  })

  it('folds only the records, parcel data and administration groups', () => {
    expect(NAV_GROUPS.filter((g) => g.collapsible).map((g) => g.key)).toEqual([
      'records',
      'data',
      'admin',
    ])
  })

  it('lists applications once and no separate queue', () => {
    expect(STAFF_NAV_ITEMS.some((i) => i.href === '/staff/queue' || i.label === 'Queue')).toBe(
      false,
    )
    expect(STAFF_NAV_ITEMS.filter((i) => i.href === '/staff/applications')).toHaveLength(1)
    expect(NAV_ICONS).not.toContain('queue')
  })

  it('gives every nav entry its own icon', () => {
    const icons = STAFF_NAV_ITEMS.map((i) => i.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })
})
