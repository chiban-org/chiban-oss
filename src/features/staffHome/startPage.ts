import { REVIEWS_PATH } from '@/features/reviews/reviewList'
import {
  HOME_ROLES,
  type HomeRole,
  type HomeRow,
  type HomeSection,
  WORK_ROLES,
} from '@/features/staffHome/homeTypes'
import { boardMemberHome } from '@/features/staffNav/navItems'
import type { NavViewer } from '@/features/staffNav/navTypes'

export type StartPage = { kind: 'redirect'; to: string } | { kind: 'home'; roles: HomeRole[] }

const EXTRA_ROLES: readonly HomeRole[] = ['reviewer', 'board_member']

function holds(viewer: NavViewer, role: HomeRole): boolean {
  return viewer.roles.includes(role)
}

export function startPageFor(viewer: NavViewer): StartPage {
  const work = WORK_ROLES.filter((role) => holds(viewer, role))
  if (work.length > 0) {
    return { kind: 'home', roles: [...work, ...EXTRA_ROLES.filter((r) => holds(viewer, r))] }
  }
  if (holds(viewer, 'reviewer')) return { kind: 'redirect', to: REVIEWS_PATH }
  return { kind: 'redirect', to: boardMemberHome(viewer) ?? '/staff/parcels' }
}

export function orderSections(sections: readonly HomeSection[]): HomeSection[] {
  const rank = (s: HomeSection) => HOME_ROLES.indexOf(s.role)
  return [...sections].sort((a, b) => b.urgency - a.urgency || rank(a) - rank(b))
}

export function shownRows(section: HomeSection): HomeRow[] {
  return section.rows.filter((row) => row.count > 0)
}
