import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { NavViewer } from '@/features/staffNav/navTypes'
import type { CivilDate } from '@/types/civilDate'

export const HOME_ROLES = [
  'admin',
  'staff',
  'inspector',
  'finance',
  'records_custodian',
  'reviewer',
  'board_member',
] as const

export type HomeRole = (typeof HOME_ROLES)[number]

export const SECTION_KEYS = [
  'system',
  'applications',
  'inspections',
  'payments',
  'records',
  'enforcement',
  'packets',
  'reviews',
  'board',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

export const WORK_ROLES: readonly HomeRole[] = [
  'admin',
  'staff',
  'inspector',
  'finance',
  'records_custodian',
]

export interface HomeRow {
  label: string
  count: number
  href: string
}

export interface HomeLink {
  label: string
  href: string
}

export interface HomeMeetingLine {
  label: string
  marker: string | null
  href: string | null
}

export type HomeDetail =
  | { kind: 'deadlines'; rows: WorkQueueRow[] }
  | { kind: 'days'; days: { date: CivilDate; count: number; href: string }[] }
  | { kind: 'meeting'; next: HomeMeetingLine | null; later: number }

export interface HomeSection {
  key: SectionKey
  title: string
  urgency: number
  rows: HomeRow[]
  links: HomeLink[]
  detail: HomeDetail | null
}

export interface HomeContext {
  db: Db
  actor: Actor
  viewer: NavViewer
  today: CivilDate
  now: Date
  signal: AbortSignal
}
