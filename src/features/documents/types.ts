import type { Actor } from '@/features/auth/actor'

export const RECORD_KINDS = ['parcel', 'project', 'application', 'inspection'] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

export interface RecordRef {
  kind: RecordKind
  id: string
}

export const AUDIENCES = ['project_parties', 'reviewers', 'board'] as const
export type Audience = (typeof AUDIENCES)[number]

export const DOC_KINDS = [
  'attachment',
  'parcel_file',
  'application_snapshot',
  'issued_permit',
  'board_material',
  'inspection_photo',
  'certificate_of_occupancy',
  'notice_proof',
] as const
export type DocKind = (typeof DOC_KINDS)[number]

export type SystemActor = { kind: 'system'; job: string }
export type DocumentActor = Actor | SystemActor

export interface DocumentListRow {
  documentId: string
  title: string
  docKind: DocKind
  audiences: Audience[]
  isPublic: boolean
  hasRedactedCopy: boolean
  createdAt: string
}

export function isRecordKind(value: string): value is RecordKind {
  return (RECORD_KINDS as readonly string[]).includes(value)
}
