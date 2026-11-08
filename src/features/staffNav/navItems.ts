import { CAPABILITY_KEYS, type Capability } from '@/constants/capabilities'
import { SETTINGS_MENU_ITEMS, settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
import { accessAllows, accessCapabilities, activeHref } from '@/features/staffNav/access'
import { STAFF_NAV_ITEMS } from '@/features/staffNav/navEntries'
import {
  NAV_GROUPS,
  type NavAccess,
  type NavItem,
  type NavSection,
  type NavViewer,
} from '@/features/staffNav/navTypes'

export { STAFF_NAV_ITEMS } from '@/features/staffNav/navEntries'
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

const NAV_ACCESS = [...STAFF_NAV_ITEMS, ...SETTINGS_MENU_ITEMS].map((item) => item.access)

export const NAV_CAPABILITIES: readonly Capability[] = CAPABILITY_KEYS.filter((capability) =>
  NAV_ACCESS.some((access) => accessCapabilities(access).includes(capability)),
)

function inSettingsMenu(href: string, viewer: NavViewer): boolean {
  return settingsMenuFor(viewer).some((setting) => setting.href === href)
}

export function mayUse(item: NavItem, viewer: NavViewer): boolean {
  if (item.access.kind === 'settings') return settingsMenuFor(viewer).length > 0
  if (item.settingsTwin === true && inSettingsMenu(item.href, viewer)) return false
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

const INSPECTIONS_HREF = '/staff/inspections'
const INSPECTOR_DAY_HREF = '/staff/inspections/day'

function isInspectorOnly(viewer: NavViewer): boolean {
  return (
    viewer.roles.includes('inspector') &&
    !viewer.roles.includes('staff') &&
    !viewer.roles.includes('admin')
  )
}

function shapedFor(item: NavItem, viewer: NavViewer): NavItem | null {
  if (item.href === INSPECTOR_DAY_HREF) {
    if (isInspectorOnly(viewer)) return null
    return viewer.roles.includes('inspector') ? item : { ...item, label: 'Inspector days' }
  }
  if (item.href === INSPECTIONS_HREF && isInspectorOnly(viewer)) {
    return {
      ...item,
      href: INSPECTOR_DAY_HREF,
      match: [INSPECTIONS_HREF],
      access: { kind: 'anyCapability', capabilities: ['inspection.record'] },
    }
  }
  return item
}

export function navItemsFor(viewer: NavViewer): NavItem[] {
  return STAFF_NAV_ITEMS.flatMap((item) => {
    const shaped = shapedFor(item, viewer)
    return shaped !== null && mayUse(shaped, viewer) ? [shaped] : []
  })
}

export function mayOpen(href: string, viewer: NavViewer): boolean {
  const item = STAFF_NAV_ITEMS.find((i) => i.href === href)
  if (item !== undefined && mayUse(item, viewer)) return true
  return inSettingsMenu(href, viewer)
}
