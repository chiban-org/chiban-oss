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
  | { kind: 'fullRecordAccess' }

export const NAV_GROUPS = [
  { key: 'work', label: 'Daily work' },
  { key: 'boards', label: 'Boards' },
  { key: 'records', label: 'Records and reports' },
  { key: 'data', label: 'Parcel data' },
  { key: 'admin', label: 'Administration' },
  { key: 'account', label: null },
] as const

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key']

export interface NavItem {
  href: string
  label: string
  group: NavGroupKey
  access: NavAccess
}

export interface NavSection {
  key: NavGroupKey
  label: string | null
  items: NavItem[]
}

export function groupNavItems(items: readonly NavItem[]): NavSection[] {
  return NAV_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: items.filter((i) => i.group === g.key),
  })).filter((section) => section.items.length > 0)
}

export function activeNavHref(pathname: string, items: readonly NavItem[]): string | null {
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
  if (matches.length === 0) return null
  return matches.reduce((best, i) => (i.href.length > best.href.length ? i : best)).href
}

const open: NavAccess = { kind: 'open' }
const records: NavAccess = { kind: 'fullRecordAccess' }
const any = (...capabilities: Capability[]): NavAccess => ({ kind: 'anyCapability', capabilities })

export const STAFF_NAV_ITEMS: readonly NavItem[] = [
  { href: '/staff/parcels', label: 'Parcels', group: 'work', access: open },
  {
    href: '/staff/counter',
    label: 'Counter',
    group: 'work',
    access: { kind: 'allCapabilities', capabilities: ['permit.issue', 'payment.collect'] },
  },
  {
    href: '/staff/queue',
    label: 'Queue',
    group: 'work',
    access: { kind: 'fullRecordAccessOrReviewer' },
  },
  { href: '/staff/reviews', label: 'Reviews', group: 'work', access: { kind: 'reviewer' } },
  {
    href: '/staff/applications',
    label: 'Applications',
    group: 'work',
    access: { kind: 'fullRecordAccessOrReviewer' },
  },
  {
    href: '/staff/inspections',
    label: 'Inspections',
    group: 'work',
    access: any('inspection.schedule'),
  },
  {
    href: '/staff/inspections/day',
    label: 'My day',
    group: 'work',
    access: any('inspection.record'),
  },
  {
    href: '/staff/payments',
    label: 'Payments',
    group: 'work',
    access: any('payment.collect', 'payment.report', 'payment.refund_void_correct'),
  },
  { href: '/staff/boards', label: 'Boards', group: 'boards', access: any('board.record') },
  {
    href: '/staff/boards/members',
    label: 'Board members',
    group: 'boards',
    access: any('board.manage_members'),
  },
  { href: '/staff/rosters', label: 'Rosters', group: 'boards', access: any('abutters.manage') },
  {
    href: '/staff/boards/packets',
    label: 'Board packets',
    group: 'boards',
    access: any('packet.manage'),
  },
  {
    href: '/staff/records/preservation',
    label: 'Records',
    group: 'records',
    access: any('document.manage'),
  },
  {
    href: '/staff/records/holds',
    label: 'Legal holds',
    group: 'records',
    access: any('hold.place_release'),
  },
  {
    href: '/staff/records/requests',
    label: 'Right-to-Know',
    group: 'records',
    access: any('rtk.manage'),
  },
  {
    href: '/staff/records/retention',
    label: 'Retention',
    group: 'records',
    access: any('disposition.propose', 'disposition.approve'),
  },
  {
    href: '/staff/enforcement',
    label: 'Enforcement',
    group: 'work',
    access: any('enforcement.manage', 'enforcement.refer_counsel', 'fine.record'),
  },
  { href: '/staff/reports', label: 'Reports', group: 'records', access: any('report.view') },
  {
    href: '/staff/reports/census',
    label: 'Census report',
    group: 'records',
    access: any('report.view'),
  },
  { href: '/staff/map', label: 'Map', group: 'work', access: open },
  { href: '/staff/gis/imports', label: 'Imports', group: 'data', access: records },
  { href: '/staff/gis/exceptions', label: 'Exceptions', group: 'data', access: records },
  {
    href: '/staff/parcels/unresolved',
    label: 'Unresolved records',
    group: 'data',
    access: records,
  },
  { href: '/staff/overrides/aliases', label: 'Overrides', group: 'data', access: records },
  { href: '/staff/settings', label: 'Settings', group: 'admin', access: records },
  { href: '/staff/admin/export', label: 'Export', group: 'admin', access: any('export.download') },
  { href: '/staff/admin/health', label: 'Health', group: 'admin', access: any('config.edit') },
  { href: '/staff/admin/cutover', label: 'Cutover', group: 'admin', access: any('cutover.import') },
  {
    href: '/staff/admin/enforcement-officers',
    label: 'Enforcement officers',
    group: 'admin',
    access: any('config.edit'),
  },
  {
    href: '/staff/admin/anonymous-intake',
    label: 'Anonymous intake',
    group: 'admin',
    access: any('anonymous_intake.enable'),
  },
  {
    href: '/staff/admin/migration',
    label: 'Migration',
    group: 'admin',
    access: { kind: 'allCapabilities', capabilities: ['document.manage', 'parcel.manage'] },
  },
  { href: '/staff/account', label: 'Account', group: 'account', access: open },
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
    case 'fullRecordAccess':
      return hasRecordAccess(viewer.roles)
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
