import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'

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

export function navLink(
  href: string,
  label: string,
  sections: readonly string[] = [href],
): NavLink {
  return { href, label, sections }
}

export const SIGN_IN = navLink('/sign-in', 'Sign in')

export const PRIMARY_NAV: readonly NavLink[] = [
  navLink('/parcels', 'Parcels'),
  navLink('/meetings', 'Meetings'),
  navLink('/complaints/new', 'Report a problem', ['/complaints', '/report-anonymously']),
  { ...navLink('/portal/apply', 'Apply for a permit'), emphasis: true },
]

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
