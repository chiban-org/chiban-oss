import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { recordsRequest } from '@/features/packs/vocabulary'
import { startPageFor } from '@/features/staffHome/startPage'

export interface NavLink {
  href: string
  label: string
  sections: readonly string[]
  emphasis?: boolean
}

export interface NavViewer {
  kind: 'staff' | 'public'
  roles: readonly Role[]
  capabilities?: ReadonlySet<Capability>
}

function link(href: string, label: string, sections: readonly string[] = [href]): NavLink {
  return { href, label, sections }
}

export const PRIMARY_NAV: readonly NavLink[] = [
  link('/parcels', 'Parcels'),
  link('/meetings', 'Meetings'),
  link('/complaints/new', 'Report a problem', ['/complaints', '/report-anonymously']),
  { ...link('/portal/apply', 'Apply for a permit'), emphasis: true },
]

export function primaryNav(): NavLink[] {
  const request = recordsRequest()
  const records = link(
    '/records/request',
    `${request.charAt(0).toUpperCase()}${request.slice(1)}`,
    ['/records'],
  )
  return [...PRIMARY_NAV.slice(0, -1), records, ...PRIMARY_NAV.slice(-1)]
}

const SIGN_IN = link('/sign-in', 'Sign in')

function opensStaffSite(viewer: NavViewer): boolean {
  if (viewer.kind !== 'staff') return false
  const start = startPageFor({
    roles: viewer.roles,
    capabilities: viewer.capabilities ?? new Set(),
  })
  return start.kind !== 'redirect' || start.to !== '/board'
}

export function accountLinksFor(viewer: NavViewer | null): NavLink[] {
  if (viewer === null) return [SIGN_IN]
  return [
    link('/portal', 'Your applications'),
    ...(viewer.roles.includes('contractor')
      ? [link('/portal/contractor', 'Contractor projects')]
      : []),
    ...(viewer.roles.includes('board_member') ? [link('/board', 'Your board')] : []),
    ...(opensStaffSite(viewer) ? [link('/staff', 'Staff site')] : []),
    link('/account', 'Account'),
  ]
}

function within(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`)
}

export function currentNavHref(pathname: string, links: readonly NavLink[]): string | null {
  let best: { href: string; length: number } | null = null
  for (const entry of links) {
    for (const section of entry.sections) {
      if (!within(pathname, section)) continue
      if (best === null || section.length > best.length) {
        best = { href: entry.href, length: section.length }
      }
    }
  }
  return best?.href ?? null
}

const PRIVATE_LINK_SECTIONS = ['/board/packets']

export function accountLinksAt(links: readonly NavLink[], pathname: string): NavLink[] {
  if (!PRIVATE_LINK_SECTIONS.some((section) => within(pathname, section))) return [...links]
  return links.filter((entry) => entry.href !== SIGN_IN.href)
}
