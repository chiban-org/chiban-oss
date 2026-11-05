import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'

export interface NavViewer {
  roles: readonly Role[]
  capabilities: ReadonlySet<Capability>
}

export type BaseNavAccess =
  | { kind: 'open' }
  | { kind: 'anyCapability'; capabilities: readonly Capability[] }
  | { kind: 'allCapabilities'; capabilities: readonly Capability[] }
  | { kind: 'reviewer' }
  | { kind: 'fullRecordAccess' }
  | { kind: 'boardMember' }

export type NavAccess = BaseNavAccess | { kind: 'settings' }

export const NAV_GROUPS = [
  { key: 'work', label: 'Daily work', collapsible: false },
  { key: 'boards', label: 'Boards', collapsible: false },
  { key: 'records', label: 'Records and reports', collapsible: true },
  { key: 'data', label: 'Parcel data', collapsible: true },
  { key: 'settings', label: null, collapsible: false },
  { key: 'account', label: null, collapsible: false },
] as const

export const NAV_ICONS = [
  'parcels',
  'map',
  'counter',
  'reviews',
  'applications',
  'inspections',
  'day',
  'payments',
  'enforcement',
  'boards',
  'meetings',
  'members',
  'contacts',
  'packets',
  'boardHome',
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
  match?: readonly string[]
  access: NavAccess
}

export interface NavSection {
  key: NavGroupKey
  label: string | null
  collapsible: boolean
  items: NavItem[]
}
