export interface NavLink {
  href: string
  label: string
  sections: readonly string[]
  emphasis?: boolean
}

export interface NavViewer {
  kind: 'staff' | 'public'
  roles: readonly string[]
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

const SIGN_IN = link('/sign-in', 'Sign in')

export function accountLinksFor(viewer: NavViewer | null): NavLink[] {
  if (viewer === null) return [SIGN_IN]
  return [
    link('/portal', 'Your applications'),
    ...(viewer.roles.includes('contractor')
      ? [link('/portal/contractor', 'Contractor projects')]
      : []),
    ...(viewer.roles.includes('board_member') ? [link('/board', 'Your board')] : []),
    ...(viewer.kind === 'staff' ? [link('/staff', 'Staff site')] : []),
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
