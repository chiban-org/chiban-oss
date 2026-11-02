import { describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { navItemsFor, STAFF_NAV_ITEMS } from '@/features/staffNav/navItems'

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
    expect(labels).toContain('Records')
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
    for (const hidden of ['Queue', 'Applications', 'Reviews', 'Payments', 'Counter', 'Reports']) {
      expect(labels).not.toContain(hidden)
    }
    expect(labels).toContain('Parcels')
    expect(labels).toContain('Account')
  })

  it('shows a reviewer reviews, applications and the queue but not the day list', () => {
    const labels = labelsFor('reviewer')
    expect(labels).toContain('Reviews')
    expect(labels).toContain('Applications')
    expect(labels).toContain('Queue')
    expect(labels).not.toContain('My day')
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
})
