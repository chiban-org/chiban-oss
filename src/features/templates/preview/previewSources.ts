import {
  DECISION_SOURCE,
  HEARING_NOTICE_SOURCE,
  LETTER_SOURCE,
  PERMIT_SOURCE,
  PLACARD_SOURCE,
} from '@/features/templates/preview/applicationSources'
import { AGENDA_SOURCE, BOARD_PACKET_COVER_SOURCE } from '@/features/templates/preview/boardSources'
import {
  CERTIFICATE_SOURCE,
  COUNSEL_PACKET_COVER_SOURCE,
  TRC_SUMMARY_SOURCE,
} from '@/features/templates/preview/extraSources'
import { RECEIPT_SOURCE, RTK_RESPONSE_SOURCE } from '@/features/templates/preview/officeSources'
import { ENFORCEMENT_ORDER_SOURCE } from '@/features/templates/preview/orderSources'
import type { PreviewSource } from '@/features/templates/preview/previewTypes'
import type { TemplateKind } from '@/features/templates/templateSchema'

const SOURCES: ReadonlyMap<TemplateKind, PreviewSource> = new Map<TemplateKind, PreviewSource>([
  ['permit', PERMIT_SOURCE],
  ['placard', PLACARD_SOURCE],
  ['letter', LETTER_SOURCE],
  ['hearing_notice', HEARING_NOTICE_SOURCE],
  ['notice_of_decision', DECISION_SOURCE],
  ['decision_letter', DECISION_SOURCE],
  ['agenda', AGENDA_SOURCE],
  ['enforcement_order', ENFORCEMENT_ORDER_SOURCE],
  ['rtk_response', RTK_RESPONSE_SOURCE],
  ['counsel_packet_cover', COUNSEL_PACKET_COVER_SOURCE],
  ['receipt', RECEIPT_SOURCE],
  ['certificate', CERTIFICATE_SOURCE],
  ['board_packet_cover', BOARD_PACKET_COVER_SOURCE],
  ['trc_summary', TRC_SUMMARY_SOURCE],
])

export function previewSource(kind: TemplateKind): PreviewSource | null {
  return SOURCES.get(kind) ?? null
}
