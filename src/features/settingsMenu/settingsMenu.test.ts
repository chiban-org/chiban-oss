import { describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import {
  filterSettingsSections,
  groupSettingsMenu,
  SETTINGS_MENU_ITEMS,
  settingsMenuFor,
} from '@/features/settingsMenu/settingsMenu'
import { activeHref } from '@/features/staffNav/access'
import { mayOpen } from '@/features/staffNav/navItems'

const GRANTS = new Map(Object.entries(DEFAULT_GRANTS))

function viewerOf(role: Role) {
  return { roles: [role], capabilities: new Set<Capability>(GRANTS.get(role) ?? []) }
}

function labelsFor(role: Role): string[] {
  return settingsMenuFor(viewerOf(role)).map((i) => i.label)
}

describe('settings menu', () => {
  it('has one entry per href', () => {
    const hrefs = SETTINGS_MENU_ITEMS.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('shows an admin every settings page, the town group first', () => {
    const labels = labelsFor('admin')
    expect(labels).toHaveLength(SETTINGS_MENU_ITEMS.length)
    expect(labels.slice(0, 4)).toEqual([
      'Town profile',
      'Letterhead',
      'Signers',
      'Application types',
    ])
  })

  it('groups the admin menu in the fixed order', () => {
    const sections = groupSettingsMenu(settingsMenuFor(viewerOf('admin')))
    expect(sections.map((s) => s.label)).toEqual([
      'Town',
      'Permits',
      'Town rules',
      'Boards',
      'Money and inspections',
      'Starters',
      'Administration',
    ])
    expect(sections[2]?.items.map((i) => i.label)).toEqual([
      'Town rule settings',
      'Local code amendments',
      'State law',
      'Building code editions',
      'Sections for findings',
    ])
  })

  it('leaves the data pages staff can open out of their settings menu', () => {
    expect(labelsFor('staff')).toEqual([])
  })

  it('leaves the data export out of the records custodian settings menu', () => {
    expect(labelsFor('records_custodian')).toEqual([])
  })

  it('shows nothing to roles without any settings page', () => {
    for (const role of ['reviewer', 'inspector', 'finance', 'board_member'] as const) {
      expect(labelsFor(role)).toEqual([])
    }
  })

  it('lists Users under Administration only for user.manage', () => {
    const admin = groupSettingsMenu(settingsMenuFor(viewerOf('admin')))
    const administration = admin.find((s) => s.key === 'admin')?.items.map((i) => i.label)
    expect(administration).toContain('Users')
    expect(mayOpen('/staff/admin/users', viewerOf('admin'))).toBe(true)
    for (const role of ['staff', 'records_custodian', 'finance'] as const) {
      expect(labelsFor(role)).not.toContain('Users')
    }
  })

  it('keeps each admin page gate in mayOpen', () => {
    expect(mayOpen('/staff/admin/anonymous-intake', viewerOf('admin'))).toBe(true)
    expect(mayOpen('/staff/admin/anonymous-intake', viewerOf('staff'))).toBe(false)
    expect(mayOpen('/staff/admin/enforcement-officers', viewerOf('admin'))).toBe(true)
    expect(mayOpen('/staff/admin/enforcement-officers', viewerOf('staff'))).toBe(false)
  })

  it('marks the item that owns a nested settings page as current', () => {
    const items = SETTINGS_MENU_ITEMS
    expect(activeHref('/staff/settings/workflow/BP', items)).toBe(
      '/staff/settings/application_type',
    )
    expect(activeHref('/staff/settings/form/residential', items)).toBe('/staff/settings/form')
    expect(activeHref('/staff/settings/payment_settings/default', items)).toBe(
      '/staff/settings/payments',
    )
    expect(activeHref('/staff/admin/export/targets', items)).toBe('/staff/admin/export')
    expect(activeHref('/staff/settings/town_profile/default', items)).toBe(
      '/staff/settings/town-profile',
    )
    expect(activeHref('/staff/settings', items)).toBeNull()
  })

  it('filters by item name and keeps a whole group when its name matches', () => {
    const sections = groupSettingsMenu(settingsMenuFor(viewerOf('admin')))
    const fee = filterSettingsSections(sections, ' FEE ')
    expect(fee.flatMap((s) => s.items.map((i) => i.label))).toEqual([
      'Fee schedules',
      'Card payments',
    ])
    const boards = filterSettingsSections(sections, 'boards')
    expect(boards[0]?.items.map((i) => i.label)).toEqual([
      'Boards',
      'Board settings',
      'Regional notice contacts',
      'Review committee routes',
    ])
    expect(filterSettingsSections(sections, 'zzz')).toEqual([])
    const found = (query: string) =>
      filterSettingsSections(sections, query).flatMap((s) => s.items.map((i) => i.label))
    expect(found('convenience fee')).toEqual(['Card payments'])
    expect(found('alert')).toEqual(['Health'])
    expect(found('invite')).toEqual(['Users'])
    expect(filterSettingsSections(sections, '')).toEqual(sections)
  })
})
