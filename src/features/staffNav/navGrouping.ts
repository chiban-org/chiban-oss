import { activeHref } from '@/features/staffNav/access'
import { NAV_GROUPS, type NavItem, type NavSection } from '@/features/staffNav/navTypes'

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
