import { recordsRequest } from '@/features/packs/vocabulary'
import {
  type NavLink,
  type NavViewer,
  navLink,
  PRIMARY_NAV,
  SIGN_IN,
} from '@/features/publicSite/publicNav'
import { startPageFor } from '@/features/staffHome/startPage'

export function primaryNav(): NavLink[] {
  const request = recordsRequest()
  const records = navLink(
    '/records/request',
    `${request.charAt(0).toUpperCase()}${request.slice(1)}`,
    ['/records'],
  )
  return [...PRIMARY_NAV.slice(0, -1), records, ...PRIMARY_NAV.slice(-1)]
}

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
    navLink('/portal', 'Your applications'),
    ...(viewer.roles.includes('contractor')
      ? [navLink('/portal/contractor', 'Contractor projects')]
      : []),
    ...(viewer.roles.includes('board_member') ? [navLink('/board', 'Your board')] : []),
    ...(opensStaffSite(viewer) ? [navLink('/staff', 'Staff site')] : []),
    navLink('/account', 'Account'),
  ]
}
