import { describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
import {
  activeNavHref,
  groupNavItems,
  mayOpen,
  type NavViewer,
  navItemsFor,
} from '@/features/staffNav/navItems'

const PARCEL_DATA = ['Imports', 'Exceptions', 'Overrides', 'Unresolved records']
const GRANTS = new Map(Object.entries(DEFAULT_GRANTS))

function viewerOf(...roles: Role[]): NavViewer {
  return {
    roles,
    capabilities: new Set<Capability>(roles.flatMap((role) => GRANTS.get(role) ?? [])),
  }
}

function groupLabels(viewer: NavViewer, group: string): string[] {
  return (
    groupNavItems(navItemsFor(viewer))
      .find((section) => section.key === group)
      ?.items.map((item) => item.label) ?? []
  )
}

function settingsLabels(viewer: NavViewer): string[] {
  return settingsMenuFor(viewer).map((item) => item.label)
}

describe('parcel data in the staff nav', () => {
  it('is hidden from inspectors, finance and records custodians, who keep Applications', () => {
    for (const role of ['inspector', 'finance', 'records_custodian'] as const) {
      const labels = navItemsFor(viewerOf(role)).map((item) => item.label)
      for (const label of PARCEL_DATA) expect(labels).not.toContain(label)
      expect(labels).toContain('Applications')
    }
  })

  it('shows to anyone who can manage parcels or run imports', () => {
    expect(groupLabels(viewerOf('staff'), 'data')).toEqual(expect.arrayContaining(PARCEL_DATA))
    const importer: NavViewer = {
      roles: ['records_custodian'],
      capabilities: new Set<Capability>(['gis.import']),
    }
    expect(groupLabels(importer, 'data')).toEqual(['Imports', 'Exceptions', 'Overrides'])
  })
})

describe('data pages outside Settings', () => {
  it('puts Data export under Records and reports for the records custodian', () => {
    const custodian = viewerOf('records_custodian')
    expect(groupLabels(custodian, 'records')).toContain('Data export')
    expect(settingsLabels(custodian)).not.toContain('Data export')
    expect(navItemsFor(custodian).map((item) => item.label)).not.toContain('Settings')
    expect(mayOpen('/staff/admin/export', custodian)).toBe(true)
    expect(activeNavHref('/staff/admin/export/targets', navItemsFor(custodian))).toBe(
      '/staff/admin/export',
    )
  })

  it('puts the cutover and scanned files under Parcel data for staff, with no Settings entry', () => {
    const staff = viewerOf('staff')
    expect(groupLabels(staff, 'data')).toEqual(
      expect.arrayContaining(['Move open applications over', 'Scanned property files']),
    )
    expect(settingsLabels(staff)).toEqual([])
    expect(navItemsFor(staff).map((item) => item.label)).not.toContain('Settings')
    expect(mayOpen('/staff/admin/cutover', staff)).toBe(true)
    expect(mayOpen('/staff/admin/migration', staff)).toBe(true)
    expect(mayOpen('/staff/admin/export', staff)).toBe(false)
  })

  it('keeps all three in the Administration settings group for admin and out of its main nav', () => {
    const admin = viewerOf('admin')
    const main = navItemsFor(admin).map((item) => item.label)
    for (const label of ['Data export', 'Move open applications over', 'Scanned property files']) {
      expect(settingsLabels(admin)).toContain(label)
      expect(main).not.toContain(label)
    }
    for (const href of ['/staff/admin/export', '/staff/admin/cutover', '/staff/admin/migration']) {
      expect(mayOpen(href, admin)).toBe(true)
    }
  })

  it('keeps Settings for staff who can also open another settings page', () => {
    const editor: NavViewer = {
      roles: ['staff'],
      capabilities: new Set<Capability>([...(GRANTS.get('staff') ?? []), 'config.edit']),
    }
    expect(navItemsFor(editor).map((item) => item.label)).toContain('Settings')
  })
})
