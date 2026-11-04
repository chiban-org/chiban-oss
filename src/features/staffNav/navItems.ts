import { CAPABILITY_KEYS, type Capability } from '@/constants/capabilities'
import { SETTINGS_MENU_ITEMS, settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
import { accessAllows, accessCapabilities, activeHref } from '@/features/staffNav/access'
import {
  NAV_GROUPS,
  type NavAccess,
  type NavItem,
  type NavSection,
  type NavViewer,
} from '@/features/staffNav/navTypes'

export type {
  NavGroupKey,
  NavIcon,
  NavItem,
  NavSection,
  NavViewer,
} from '@/features/staffNav/navTypes'
export { NAV_GROUPS, NAV_ICONS } from '@/features/staffNav/navTypes'

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
  return activeHref(pathname, items)
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
    access: records,
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
    href: '/staff/boards/meetings',
    label: 'Meetings',
    group: 'boards',
    icon: 'meetings',
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
    href: '/board',
    label: 'Board meetings',
    group: 'boards',
    icon: 'boardHome',
    access: { kind: 'boardMember' },
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
    access: any('parcel.manage'),
  },
  {
    href: '/staff/overrides/aliases',
    label: 'Overrides',
    group: 'data',
    icon: 'overrides',
    access: records,
  },
  {
    href: '/staff/settings',
    label: 'Settings',
    group: 'settings',
    icon: 'settings',
    match: ['/staff/admin'],
    access: { kind: 'settings' },
  },
  { href: '/staff/account', label: 'Account', group: 'account', icon: 'account', access: open },
]

const NAV_ACCESS = [...STAFF_NAV_ITEMS, ...SETTINGS_MENU_ITEMS].map((item) => item.access)

export const NAV_CAPABILITIES: readonly Capability[] = CAPABILITY_KEYS.filter((capability) =>
  NAV_ACCESS.some((access) => accessCapabilities(access).includes(capability)),
)

export function mayUse(item: NavItem, viewer: NavViewer): boolean {
  if (item.access.kind === 'settings') return settingsMenuFor(viewer).length > 0
  return accessAllows(item.access, viewer)
}

const BOARD_STAFF_CAPABILITIES: readonly Capability[] = [
  'board.record',
  'board.manage_members',
  'packet.manage',
]

export function boardMemberHome(viewer: NavViewer): string | null {
  if (!viewer.roles.includes('board_member')) return null
  return BOARD_STAFF_CAPABILITIES.some((c) => viewer.capabilities.has(c)) ? null : '/board'
}

export function navItemsFor(viewer: NavViewer): NavItem[] {
  return STAFF_NAV_ITEMS.filter((item) => mayUse(item, viewer))
}

export function mayOpen(href: string, viewer: NavViewer): boolean {
  const item = STAFF_NAV_ITEMS.find((i) => i.href === href)
  if (item !== undefined) return mayUse(item, viewer)
  const setting = SETTINGS_MENU_ITEMS.find((i) => i.href === href)
  return setting === undefined ? false : accessAllows(setting.access, viewer)
}
