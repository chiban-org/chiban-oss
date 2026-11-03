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
  { key: 'work', label: 'Daily work', collapsible: false },
  { key: 'boards', label: 'Boards', collapsible: false },
  { key: 'records', label: 'Records and reports', collapsible: true },
  { key: 'data', label: 'Parcel data', collapsible: true },
  { key: 'admin', label: 'Administration', collapsible: true },
  { key: 'account', label: null, collapsible: false },
] as const

export const NAV_ICONS = [
  'parcels',
  'map',
  'counter',
  'queue',
  'reviews',
  'applications',
  'inspections',
  'day',
  'payments',
  'enforcement',
  'boards',
  'members',
  'rosters',
  'packets',
  'preservation',
  'holds',
  'requests',
  'retention',
  'reports',
  'census',
  'imports',
  'exceptions',
  'unresolved',
  'overrides',
  'settings',
  'export',
  'health',
  'cutover',
  'officers',
  'intake',
  'migration',
  'account',
] as const

export type NavIcon = (typeof NAV_ICONS)[number]

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key']

export interface NavItem {
  href: string
  label: string
  group: NavGroupKey
  icon: NavIcon
  parent?: string
  access: NavAccess
}

export interface NavSection {
  key: NavGroupKey
  label: string | null
  collapsible: boolean
  items: NavItem[]
}

export function groupNavItems(items: readonly NavItem[]): NavSection[] {
  return NAV_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    collapsible: g.collapsible,
    items: items.filter((i) => i.group === g.key),
  })).filter((section) => section.items.length > 0)
}

export function isNested(item: NavItem, items: readonly NavItem[]): boolean {
  return item.parent !== undefined && items.some((i) => i.href === item.parent)
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
  { href: '/staff/parcels', label: 'Parcels', group: 'work', icon: 'parcels', access: open },
  { href: '/staff/map', label: 'Map', group: 'work', icon: 'map', access: open },
  {
    href: '/staff/counter',
    label: 'Counter',
    group: 'work',
    icon: 'counter',
    access: { kind: 'allCapabilities', capabilities: ['permit.issue', 'payment.collect'] },
  },
  {
    href: '/staff/queue',
    label: 'Queue',
    group: 'work',
    icon: 'queue',
    access: { kind: 'fullRecordAccessOrReviewer' },
  },
  {
    href: '/staff/reviews',
    label: 'Reviews',
    group: 'work',
    icon: 'reviews',
    access: { kind: 'reviewer' },
  },
  {
    href: '/staff/applications',
    label: 'Applications',
    group: 'work',
    icon: 'applications',
    access: { kind: 'fullRecordAccessOrReviewer' },
  },
  {
    href: '/staff/inspections',
    label: 'Inspections',
    group: 'work',
    icon: 'inspections',
    access: any('inspection.schedule'),
  },
  {
    href: '/staff/inspections/day',
    label: 'My day',
    group: 'work',
    icon: 'day',
    parent: '/staff/inspections',
    access: any('inspection.record'),
  },
  {
    href: '/staff/payments',
    label: 'Payments',
    group: 'work',
    icon: 'payments',
    access: any('payment.collect', 'payment.report', 'payment.refund_void_correct'),
  },
  {
    href: '/staff/boards',
    label: 'Board applications',
    group: 'boards',
    icon: 'boards',
    access: any('board.record'),
  },
  {
    href: '/staff/boards/members',
    label: 'Board members',
    group: 'boards',
    icon: 'members',
    access: any('board.manage_members'),
  },
  {
    href: '/staff/rosters',
    label: 'Rosters',
    group: 'boards',
    icon: 'rosters',
    access: any('abutters.manage'),
  },
  {
    href: '/staff/boards/packets',
    label: 'Board packets',
    group: 'boards',
    icon: 'packets',
    access: any('packet.manage'),
  },
  {
    href: '/staff/records/preservation',
    label: 'Preservation',
    group: 'records',
    icon: 'preservation',
    access: any('document.manage'),
  },
  {
    href: '/staff/records/holds',
    label: 'Legal holds',
    group: 'records',
    icon: 'holds',
    access: any('hold.place_release'),
  },
  {
    href: '/staff/records/requests',
    label: 'Right-to-Know',
    group: 'records',
    icon: 'requests',
    access: any('rtk.manage'),
  },
  {
    href: '/staff/records/retention',
    label: 'Retention',
    group: 'records',
    icon: 'retention',
    access: any('disposition.propose', 'disposition.approve'),
  },
  {
    href: '/staff/enforcement',
    label: 'Enforcement',
    group: 'work',
    icon: 'enforcement',
    access: any('enforcement.manage', 'enforcement.refer_counsel', 'fine.record'),
  },
  {
    href: '/staff/reports',
    label: 'Reports',
    group: 'records',
    icon: 'reports',
    access: any('report.view'),
  },
  {
    href: '/staff/reports/census',
    label: 'Census report',
    group: 'records',
    icon: 'census',
    access: any('report.view'),
  },
  { href: '/staff/gis/imports', label: 'Imports', group: 'data', icon: 'imports', access: records },
  {
    href: '/staff/gis/exceptions',
    label: 'Exceptions',
    group: 'data',
    icon: 'exceptions',
    access: records,
  },
  {
    href: '/staff/parcels/unresolved',
    label: 'Unresolved records',
    group: 'data',
    icon: 'unresolved',
    access: records,
  },
  {
    href: '/staff/overrides/aliases',
    label: 'Overrides',
    group: 'data',
    icon: 'overrides',
    access: records,
  },
  { href: '/staff/settings', label: 'Settings', group: 'admin', icon: 'settings', access: records },
  {
    href: '/staff/admin/export',
    label: 'Export',
    group: 'admin',
    icon: 'export',
    access: any('export.download'),
  },
  {
    href: '/staff/admin/health',
    label: 'Health',
    group: 'admin',
    icon: 'health',
    access: any('config.edit'),
  },
  {
    href: '/staff/admin/cutover',
    label: 'Cutover',
    group: 'admin',
    icon: 'cutover',
    access: any('cutover.import'),
  },
  {
    href: '/staff/admin/enforcement-officers',
    label: 'Enforcement officers',
    group: 'admin',
    icon: 'officers',
    access: any('config.edit'),
  },
  {
    href: '/staff/admin/anonymous-intake',
    label: 'Anonymous intake',
    group: 'admin',
    icon: 'intake',
    access: any('anonymous_intake.enable'),
  },
  {
    href: '/staff/admin/migration',
    label: 'Migration',
    group: 'admin',
    icon: 'migration',
    access: { kind: 'allCapabilities', capabilities: ['document.manage', 'parcel.manage'] },
  },
  { href: '/staff/account', label: 'Account', group: 'account', icon: 'account', access: open },
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
