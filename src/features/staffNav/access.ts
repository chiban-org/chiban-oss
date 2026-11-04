import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { FULL_RECORD_ROLES } from '@/features/access/roles'
import type { BaseNavAccess, NavAccess, NavViewer } from '@/features/staffNav/navTypes'

function hasRecordAccess(roles: readonly Role[]): boolean {
  return roles.some((r) => (FULL_RECORD_ROLES as readonly string[]).includes(r))
}

export function accessAllows(access: BaseNavAccess, viewer: NavViewer): boolean {
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
    case 'boardMember':
      return viewer.roles.includes('board_member')
  }
}

export function accessCapabilities(access: NavAccess): readonly Capability[] {
  return access.kind === 'anyCapability' || access.kind === 'allCapabilities'
    ? access.capabilities
    : []
}

export interface MatchableLink {
  href: string
  match?: readonly string[]
}

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function activeHref(pathname: string, items: readonly MatchableLink[]): string | null {
  let best: { href: string; length: number } | null = null
  for (const item of items) {
    const prefixes = [item.href, ...(item.match ?? [])].filter((p) => within(pathname, p))
    const length = Math.max(0, ...prefixes.map((p) => p.length))
    if (prefixes.length > 0 && (best === null || length > best.length)) {
      best = { href: item.href, length }
    }
  }
  return best?.href ?? null
}
