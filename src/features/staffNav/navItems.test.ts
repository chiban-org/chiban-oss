import { describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import {
  activeNavHref,
  boardMemberHome,
  groupNavItems,
  isNested,
  NAV_CAPABILITIES,
  NAV_GROUPS,
  NAV_ICONS,
  navItemsFor,
  STAFF_NAV_ITEMS,
} from '@/features/staffNav/navItems'

function viewerOf(roles: Role[]) {
  return {
    roles,
    capabilities: new Set<Capability>(roles.flatMap((r) => DEFAULT_GRANTS[r] ?? [])),
  }
}

function labelsFor(role: Role): string[] {
  return navItemsFor(viewerOf([role])).map((i) => i.label)
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

  it('hides payments and board packets from the inspector', () => {
    const labels = labelsFor('inspector')
    expect(labels).not.toContain('Payments')
    expect(labels).not.toContain('Board packets')
  })

  it('opens the inspector on their day from Inspections and shows no second entry for it', () => {
    const items = navItemsFor(viewerOf(['inspector']))
    expect(items.filter((i) => i.label === 'Inspections').map((i) => i.href)).toEqual([
      '/staff/inspections/day',
    ])
    expect(items.map((i) => i.label)).not.toContain('My day')
    expect(activeNavHref('/staff/inspections/day', items)).toBe('/staff/inspections/day')
    expect(activeNavHref('/staff/inspections/abc', items)).toBe('/staff/inspections/day')
  })

  it('keeps the board under Inspections for the clerk and the building official', () => {
    for (const roles of [['staff'], ['staff', 'inspector']] as Role[][]) {
      const items = navItemsFor(viewerOf(roles))
      expect(items.find((i) => i.label === 'Inspections')?.href).toBe('/staff/inspections')
    }
  })

  it('calls the day entry Inspector days unless the viewer is an inspector', () => {
    const dayLabel = (roles: Role[]) =>
      navItemsFor(viewerOf(roles)).find((i) => i.href === '/staff/inspections/day')?.label
    expect(dayLabel(['staff'])).toBe('Inspector days')
    expect(dayLabel(['staff', 'inspector'])).toBe('My day')
  })

  it('shows a board member only the pages that are not record workflows', () => {
    const labels = labelsFor('board_member')
    for (const hidden of ['Applications', 'Reviews', 'Payments', 'Counter', 'Reports']) {
      expect(labels).not.toContain(hidden)
    }
    expect(labels).toContain('Parcels')
    expect(labels).toContain('Account')
  })

  it('shows Board meetings, the board page, to board members only', () => {
    const item = STAFF_NAV_ITEMS.find((i) => i.label === 'Board meetings')
    expect(item?.href).toBe('/board')
    expect(labelsFor('board_member')).toContain('Board meetings')
    for (const role of ['admin', 'staff', 'reviewer', 'inspector', 'finance'] as const) {
      expect(labelsFor(role)).not.toContain('Board meetings')
    }
  })

  it('sends a board member without board staff work from the board staff pages to /board', () => {
    const viewer = (roles: Role[]) => ({
      roles,
      capabilities: new Set<Capability>(roles.flatMap((r) => DEFAULT_GRANTS[r] ?? [])),
    })
    expect(boardMemberHome(viewer(['board_member']))).toBe('/board')
    expect(boardMemberHome(viewer(['staff', 'board_member']))).toBeNull()
    expect(boardMemberHome(viewer(['reviewer']))).toBeNull()
  })

  it('shows the boards and notice contacts pages to staff and admin only', () => {
    for (const role of ['staff', 'admin'] as const) {
      expect(labelsFor(role)).toEqual(
        expect.arrayContaining(['Board applications', 'Meetings', 'Notice contacts']),
      )
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
      expect(labels).not.toContain('Meetings')
      expect(labels).not.toContain('Notice contacts')
    }
  })

  it('lists notice contacts right after Applications, among the daily work', () => {
    const work = STAFF_NAV_ITEMS.filter((i) => i.group === 'work').map((i) => i.label)
    expect(work.indexOf('Notice contacts')).toBe(work.indexOf('Applications') + 1)
    expect(STAFF_NAV_ITEMS.find((i) => i.label === 'Notice contacts')?.href).toBe(
      '/staff/notice-contacts',
    )
  })

  it('shows a reviewer reviews but not applications or the day list', () => {
    const labels = labelsFor('reviewer')
    expect(labels).toContain('Reviews')
    expect(labels).not.toContain('Applications')
    expect(labels).not.toContain('My day')
    expect(labels).not.toContain('Inspector days')
    for (const hidden of ['Imports', 'Exceptions', 'Unresolved records', 'Overrides', 'Settings']) {
      expect(labels).not.toContain(hidden)
    }
    expect(labelsFor('staff')).toEqual(
      expect.arrayContaining(['Imports', 'Exceptions', 'Unresolved records', 'Overrides']),
    )
  })

  it('shows Settings to anyone who can open at least one settings page', () => {
    expect(labelsFor('admin')).toContain('Settings')
    for (const role of [
      'staff',
      'records_custodian',
      'finance',
      'inspector',
      'reviewer',
      'board_member',
    ] as const) {
      expect(labelsFor(role)).not.toContain('Settings')
    }
  })

  it('has no Administration group, only the single Settings entry', () => {
    expect(NAV_GROUPS.map((g) => g.key)).not.toContain('admin')
    for (const label of ['Export', 'Health', 'Enforcement officers', 'Users']) {
      expect(STAFF_NAV_ITEMS.map((i) => i.label)).not.toContain(label)
    }
    expect(STAFF_NAV_ITEMS.filter((i) => i.label === 'Settings')).toHaveLength(1)
  })

  it('marks Settings current on the settings and administration pages', () => {
    expect(activeNavHref('/staff/settings/form', STAFF_NAV_ITEMS)).toBe('/staff/settings')
    const admin = navItemsFor({
      roles: ['admin'],
      capabilities: new Set<Capability>(DEFAULT_GRANTS.admin ?? []),
    })
    expect(activeNavHref('/staff/admin/export/targets', admin)).toBe('/staff/settings')
  })

  it('loads every capability a settings page needs', () => {
    expect(NAV_CAPABILITIES).toEqual(
      expect.arrayContaining([
        'config.edit',
        'export.download',
        'cutover.import',
        'anonymous_intake.enable',
        'document.manage',
        'parcel.manage',
      ]),
    )
  })

  it('shows Unresolved records only to roles that can link parcels', () => {
    for (const role of ['inspector', 'finance', 'records_custodian'] as const) {
      expect(labelsFor(role)).not.toContain('Unresolved records')
    }
    for (const role of ['admin', 'staff'] as const) {
      expect(labelsFor(role)).toContain('Unresolved records')
    }
  })

  it('shows finance the payments page', () => {
    expect(labelsFor('finance')).toContain('Payments')
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
    const official = navItemsFor(viewerOf(['staff', 'inspector'])).map((i) => i.label)
    const seen = new Set([...everyRole.flatMap(labelsFor), ...official])
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

  it('marks Imports active on the CAMA owner import page', () => {
    expect(activeNavHref('/staff/gis/imports/cama', STAFF_NAV_ITEMS)).toBe('/staff/gis/imports')
  })

  it('marks the most specific nav entry for a nested page as active', () => {
    expect(activeNavHref('/staff/inspections/day', STAFF_NAV_ITEMS)).toBe('/staff/inspections/day')
    expect(activeNavHref('/staff/inspections/123', STAFF_NAV_ITEMS)).toBe('/staff/inspections')
    expect(activeNavHref('/staff/boards/members', STAFF_NAV_ITEMS)).toBe('/staff/boards/members')
    expect(activeNavHref('/staff/boards/meetings/123', STAFF_NAV_ITEMS)).toBe(
      '/staff/boards/meetings',
    )
    expect(activeNavHref('/staff/applicationsx', STAFF_NAV_ITEMS)).toBeNull()
  })

  it('nests My day under Inspections only when the person also sees Inspections', () => {
    const day = STAFF_NAV_ITEMS.find((i) => i.href === '/staff/inspections/day')
    if (day === undefined) throw new Error('My day missing')
    expect(isNested(day, STAFF_NAV_ITEMS)).toBe(true)
    expect(isNested(day, [day])).toBe(false)
  })

  it('folds only the records and parcel data groups', () => {
    expect(NAV_GROUPS.filter((g) => g.collapsible).map((g) => g.key)).toEqual(['records', 'data'])
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
