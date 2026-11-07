import type { DocNode, TemplateDoc } from '@/features/templates/doc/docSchema'
import type { LockedSourceKey } from '@/features/templates/doc/lockedSources'
import type { MergeField } from '@/features/templates/mergeFields'

export interface RecordSectionDef {
  name: string
  label: string
}

export interface DocumentKindDef {
  label: string
  title: string
  record: string
  scale: 'document' | 'placard'
  fields: readonly MergeField[]
  sections: readonly RecordSectionDef[]
  locked: readonly LockedSourceKey[]
  defaultDoc: TemplateDoc
  textSuffix?: readonly DocNode[]
}

export const FRAME_FIELDS: readonly MergeField[] = [
  'town.name',
  'town.address',
  'town.phone',
  'town.email',
  'town.website',
  'office.name',
  'signer.building_official.name',
  'signer.building_official.title',
  'signer.land_use_administrator.name',
  'signer.land_use_administrator.title',
  'signer.planning_board_chair.name',
  'signer.planning_board_chair.title',
  'signer.zba_chair.name',
  'signer.zba_chair.title',
  'signer.code_enforcement_officer.name',
  'signer.code_enforcement_officer.title',
  'signer.town_clerk.name',
  'signer.town_clerk.title',
]

export const APPLICATION_FIELDS: readonly MergeField[] = [
  'application.number',
  'application.typeLabel',
  'application.issuedOn',
  'application.expiresOn',
  'parcel.displayId',
  'parcel.siteAddress',
  'parcel.ownerName',
  'project.title',
  'party.applicant.name',
  'party.contractor.name',
  'fees.totalFormatted',
  'conditions.list',
  'codeEdition.label',
]

export const MEETING_FIELDS: readonly MergeField[] = [
  'board.name',
  'board.short_name',
  'board.chair.name',
  'meeting.date',
  'meeting.location',
  'meeting.time',
]
