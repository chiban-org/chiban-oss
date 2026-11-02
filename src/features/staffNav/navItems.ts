import { CAPABILITY_KEYS, type Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { FULL_RECORD_ROLES } from '@/features/access/roles'

export interface NavViewer {
  roles: readonly Role[]
  capabilities: ReadonlySet<Capability>
}

type NavAccess =
  | { kind: 'open' }
  | { kind: 'anyCapability'; capabilities: readonly Capability[] }
  | { kind: 'allCapabilities'; capabilities: readonly Capability[] }
  | { kind: 'reviewer' }
  | { kind: 'fullRecordAccessOrReviewer' }

export interface NavItem {
  href: string
  label: string
  access: NavAccess
}

const open: NavAccess = { kind: 'open' }
const any = (...capabilities: Capability[]): NavAccess => ({ kind: 'anyCapability', capabilities })

export const STAFF_NAV_ITEMS: readonly NavItem[] = [
  { href: '/staff/parcels', label: 'Parcels', access: open },
  {
    href: '/staff/counter',
    label: 'Counter',
    access: { kind: 'allCapabilities', capabilities: ['permit.issue', 'payment.collect'] },
  },
  { href: '/staff/queue', label: 'Queue', access: { kind: 'fullRecordAccessOrReviewer' } },
  { href: '/staff/reviews', label: 'Reviews', access: { kind: 'reviewer' } },
  {
    href: '/staff/applications',
    label: 'Applications',
    access: { kind: 'fullRecordAccessOrReviewer' },
  },
  { href: '/staff/inspections', label: 'Inspections', access: any('inspection.schedule') },
  { href: '/staff/inspections/day', label: 'My day', access: any('inspection.record') },
  {
    href: '/staff/payments',
    label: 'Payments',
    access: any('payment.collect', 'payment.report', 'payment.refund_void_correct'),
  },
  { href: '/staff/boards/packets', label: 'Board packets', access: any('packet.manage') },
  { href: '/staff/records/preservation', label: 'Records', access: any('document.manage') },
  { href: '/staff/records/holds', label: 'Legal holds', access: any('hold.place_release') },
  {
    href: '/staff/enforcement',
    label: 'Enforcement',
    access: any('enforcement.manage', 'enforcement.refer_counsel', 'fine.record'),
  },
  { href: '/staff/reports', label: 'Reports', access: any('report.view') },
  { href: '/staff/map', label: 'Map', access: open },
  { href: '/staff/gis/imports', label: 'Imports', access: open },
  { href: '/staff/gis/exceptions', label: 'Exceptions', access: open },
  { href: '/staff/parcels/unresolved', label: 'Unresolved records', access: open },
  { href: '/staff/overrides/aliases', label: 'Overrides', access: open },
  { href: '/staff/settings', label: 'Settings', access: open },
  { href: '/staff/admin/export', label: 'Export', access: any('export.download') },
  { href: '/staff/admin/health', label: 'Health', access: any('config.edit') },
  { href: '/staff/admin/cutover', label: 'Cutover', access: any('cutover.import') },
  {
    href: '/staff/admin/anonymous-intake',
    label: 'Anonymous intake',
    access: any('anonymous_intake.enable'),
  },
  {
    href: '/staff/admin/migration',
    label: 'Migration',
    access: { kind: 'allCapabilities', capabilities: ['document.manage', 'parcel.manage'] },
  },
  { href: '/staff/account', label: 'Account', access: open },
]

export const NAV_CAPABILITIES: readonly Capability[] = CAPABILITY_KEYS.filter((capability) =>
  STAFF_NAV_ITEMS.some(
    (item) =>
      (item.access.kind === 'anyCapability' || item.access.kind === 'allCapabilities') &&
      item.access.capabilities.includes(capability),
  ),
)

function hasRecordAccess(roles: readonly Role[]): boolean {
  return roles.some((r) => (FULL_RECORD_ROLES as readonly string[]).includes(r))
}

export function mayUse(item: NavItem, viewer: NavViewer): boolean {
  const { access } = item
  switch (access.kind) {
    case 'open':
      return true
    case 'anyCapability':
      return access.capabilities.some((c) => viewer.capabilities.has(c))
    case 'allCapabilities':
      return access.capabilities.every((c) => viewer.capabilities.has(c))
    case 'reviewer':
      return viewer.roles.includes('reviewer')
    case 'fullRecordAccessOrReviewer':
      return hasRecordAccess(viewer.roles) || viewer.roles.includes('reviewer')
  }
}

export function navItemsFor(viewer: NavViewer): NavItem[] {
  return STAFF_NAV_ITEMS.filter((item) => mayUse(item, viewer))
}

export function mayOpen(href: string, viewer: NavViewer): boolean {
  const item = STAFF_NAV_ITEMS.find((i) => i.href === href)
  return item === undefined ? false : mayUse(item, viewer)
}
