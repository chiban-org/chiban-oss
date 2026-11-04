import type { DocNode, TemplateDoc } from '@/features/templates/doc/docSchema'
import {
  CERTIFICATE_KIND,
  LETTER_KIND,
  PERMIT_KIND,
  PLACARD_KIND,
  TRC_SUMMARY_KIND,
} from '@/features/templates/kinds/applicationKinds'
import {
  AGENDA_KIND,
  BOARD_PACKET_COVER_KIND,
  DECISION_LETTER_KIND,
  HEARING_NOTICE_KIND,
  NOTICE_OF_DECISION_KIND,
} from '@/features/templates/kinds/boardKinds'
import {
  COUNSEL_PACKET_COVER_KIND,
  ENFORCEMENT_ORDER_KIND,
} from '@/features/templates/kinds/enforcementKinds'
import { type DocumentKindDef, FRAME_FIELDS } from '@/features/templates/kinds/kindTypes'
import { RECEIPT_KIND, RTK_RESPONSE_KIND } from '@/features/templates/kinds/officeKinds'
import type { MergeField } from '@/features/templates/mergeFields'
import type { TemplateKind } from '@/features/templates/templateSchema'

export const DOCUMENT_KINDS: Record<TemplateKind, DocumentKindDef> = {
  permit: PERMIT_KIND,
  placard: PLACARD_KIND,
  letter: LETTER_KIND,
  hearing_notice: HEARING_NOTICE_KIND,
  notice_of_decision: NOTICE_OF_DECISION_KIND,
  decision_letter: DECISION_LETTER_KIND,
  agenda: AGENDA_KIND,
  enforcement_order: ENFORCEMENT_ORDER_KIND,
  rtk_response: RTK_RESPONSE_KIND,
  counsel_packet_cover: COUNSEL_PACKET_COVER_KIND,
  receipt: RECEIPT_KIND,
  certificate: CERTIFICATE_KIND,
  board_packet_cover: BOARD_PACKET_COVER_KIND,
  trc_summary: TRC_SUMMARY_KIND,
}

const BY_KIND: ReadonlyMap<string, DocumentKindDef> = new Map(Object.entries(DOCUMENT_KINDS))

export function documentKind(kind: TemplateKind): DocumentKindDef {
  return BY_KIND.get(kind) ?? LETTER_KIND
}

export function allowedFields(kind: TemplateKind): ReadonlySet<MergeField> {
  return new Set([...FRAME_FIELDS, ...documentKind(kind).fields])
}

export function textSuffix(kind: TemplateKind): readonly DocNode[] {
  return documentKind(kind).textSuffix ?? []
}

export function defaultDoc(kind: TemplateKind): TemplateDoc {
  return documentKind(kind).defaultDoc
}

export function defaultTemplateKey(kind: TemplateKind): string {
  return kind.replaceAll('_', '-')
}
