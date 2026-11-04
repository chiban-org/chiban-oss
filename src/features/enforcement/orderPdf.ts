import type { CeaseAndDesistRule, OrderContentField } from '@packs/nh/schema'
import {
  NOTICE_OF_VIOLATION_INTRO,
  NOTICE_OF_VIOLATION_REQUEST,
  ORDER_CEASE_SENTENCE,
  ORDER_LIEN_WARNING,
  ORDER_MOTION_NOTICE,
} from '@packs/nh/starters/enforcementTemplates'
import type { violationFindings } from '@/db/schema'
import { PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type PdfBlock, renderPdf } from '@/features/pdf/renderPdf'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { formatCivilDate } from '@/lib/formatDate'

type Finding = typeof violationFindings.$inferSelect

export interface OrderPdfInput {
  frame: DocumentFrame
  number: string
  rule: CeaseAndDesistRule
  locationText: string
  findings: Finding[]
  correctiveAction: string
  correctiveDeadline: string | null
  ceaseImmediately: boolean
  issuedOn: string
  issuerName: string
  issuerTitle: string
}

const provisionLines = (findings: Finding[]) =>
  findings.map((f) => `${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`)

export function missingOrderContent(
  rule: CeaseAndDesistRule,
  input: Pick<OrderPdfInput, 'findings' | 'correctiveAction' | 'correctiveDeadline'>,
): OrderContentField[] {
  const present: Record<OrderContentField, boolean> = {
    provisions: input.findings.length > 0 && input.findings.every((f) => f.provisionRef !== ''),
    facts: input.findings.length > 0 && input.findings.every((f) => f.facts !== ''),
    inspectionDate:
      input.findings.length > 0 && input.findings.every((f) => f.inspectionDate !== ''),
    correctiveAction: input.correctiveAction.trim() !== '',
    correctiveDeadline: input.correctiveDeadline !== null,
    motionNotice: true,
    lienWarning: true,
  }
  return rule.contentFields.filter((field) => !present[field])
}

const paragraph = (text: string): PdfBlock => ({ kind: 'paragraph', text })

function orderSections(input: OrderPdfInput): Map<string, PdfBlock[]> {
  const wants = (field: OrderContentField) => input.rule.contentFields.includes(field)
  const dates = [...new Set(input.findings.map((f) => f.inspectionDate))]
  const deadline = input.correctiveDeadline
  return new Map([
    ['order.provisions', wants('provisions') ? provisionLines(input.findings).map(paragraph) : []],
    ['order.facts', wants('facts') ? input.findings.map((f) => paragraph(f.facts)) : []],
    [
      'order.inspectionDates',
      wants('inspectionDate') ? dates.map((d) => paragraph(formatCivilDate(d))) : [],
    ],
    [
      'order.correctiveAction',
      wants('correctiveAction') ? [paragraph(input.correctiveAction)] : [],
    ],
    [
      'order.correctiveDeadline',
      wants('correctiveDeadline') && deadline !== null
        ? [paragraph(formatCivilDate(deadline))]
        : [],
    ],
  ])
}

function orderLocked(input: OrderPdfInput): Map<string, string> {
  const wants = (field: OrderContentField) => input.rule.contentFields.includes(field)
  return new Map([
    ['order.ceaseSentence', input.ceaseImmediately ? ORDER_CEASE_SENTENCE : ''],
    ['order.motionNotice', wants('motionNotice') ? ORDER_MOTION_NOTICE : ''],
    ['order.lienWarning', wants('lienWarning') ? ORDER_LIEN_WARNING : ''],
  ])
}

export function orderDocumentInput(input: OrderPdfInput): DocumentInput {
  return {
    subtitle: input.number,
    frame: input.frame,
    context: {
      values: {
        'order.number': input.number,
        'order.property': input.locationText,
        'order.issuedOn': formatCivilDate(input.issuedOn),
        'order.authority': input.rule.citation.label,
        'order.correctiveAction': input.correctiveAction,
        'order.correctiveDeadline':
          input.correctiveDeadline === null ? '' : formatCivilDate(input.correctiveDeadline),
        'order.issuerName': input.issuerName,
        'order.issuerTitle': input.issuerTitle,
      },
      sections: orderSections(input),
      locked: orderLocked(input),
      people: new Map([
        ['code_enforcement_officer', { name: input.issuerName, title: input.issuerTitle }],
      ]),
    },
  }
}

export async function renderOrderPdf(
  input: OrderPdfInput,
  template: TemplateBody | null = null,
): Promise<Uint8Array> {
  return await renderDocumentOrDefault('enforcement_order', template, orderDocumentInput(input))
}

export interface NoticePdfInput {
  frame: DocumentFrame
  caseNumber: string
  locationText: string
  findings: Finding[]
  sentOn: string
}

export async function renderNoticePdf(input: NoticePdfInput): Promise<Uint8Array> {
  const blocks: PdfBlock[] = [
    { kind: 'paragraph', text: NOTICE_OF_VIOLATION_INTRO },
    {
      kind: 'fields',
      rows: [
        { label: 'Case', value: input.caseNumber },
        { label: 'Property', value: input.locationText },
        { label: 'Sent', value: formatCivilDate(input.sentOn) },
      ],
    },
    { kind: 'heading', text: 'Provisions' },
    ...provisionLines(input.findings).map((text): PdfBlock => ({ kind: 'paragraph', text })),
    { kind: 'heading', text: 'What was found' },
    ...input.findings.map(
      (f): PdfBlock => ({
        kind: 'paragraph',
        text: `${f.facts} (inspected ${formatCivilDate(f.inspectionDate)})`,
      }),
    ),
    { kind: 'paragraph', text: NOTICE_OF_VIOLATION_REQUEST },
  ]
  return await renderPdf({
    title: 'Notice of violation',
    subtitle: input.caseNumber,
    frame: input.frame,
    scale: 'document',
    blocks,
  })
}
